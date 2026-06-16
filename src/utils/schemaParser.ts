import type { ParsedFile } from './repoParser';

export interface DbField {
  name: string;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  refTable?: string;
  refField?: string;
}

export interface DbTable {
  id: string; // Table or Model Name
  sourceFile: string;
  fields: DbField[];
}

export interface DbRelationship {
  id: string; // Unique relationship id
  source: string; // Source Table Name
  target: string; // Target Table Name
  sourceField: string;
  targetField: string;
}

export interface DbSchemaReport {
  tables: DbTable[];
  relationships: DbRelationship[];
}

function stripComments(code: string): string {
  // Strip block comments
  let clean = code.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip line comments
  clean = clean.split('\n').map(line => {
    const idx = line.indexOf('//');
    if (idx !== -1) {
      return line.substring(0, idx);
    }
    return line;
  }).join('\n');
  return clean;
}

function getOuterObject(content: string, startIndex: number): { body: string; endIndex: number } | null {
  let openBraces = 0;
  let inString = false;
  let stringChar = '';
  let i = startIndex;

  // Find the first '{'
  while (i < content.length && content[i] !== '{') {
    i++;
  }
  if (i >= content.length) return null;

  const startBraceIndex = i;
  
  for (; i < content.length; i++) {
    const char = content[i];
    
    // Handle string literals to avoid counting braces inside strings
    if ((char === "'" || char === '"' || char === '`') && content[i - 1] !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }
    
    if (!inString) {
      if (char === '{') {
        openBraces++;
      } else if (char === '}') {
        openBraces--;
        if (openBraces === 0) {
          return {
            body: content.substring(startBraceIndex + 1, i),
            endIndex: i
          };
        }
      }
    }
  }
  return null;
}

interface RawField {
  name: string;
  definition: string;
}

function parseTopLevelFields(body: string): RawField[] {
  const fields: RawField[] = [];
  let currentKey = '';
  let inKey = true;
  let openBraces = 0;
  let openBrackets = 0;
  let inString = false;
  let stringChar = '';
  let currentDef = '';
  
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    
    // Handle string literals
    if ((char === "'" || char === '"' || char === '`') && body[i - 1] !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
    }
    
    if (inString) {
      if (inKey) {
        currentKey += char;
      } else {
        currentDef += char;
      }
      continue;
    }
    
    if (char === '{') openBraces++;
    else if (char === '}') openBraces--;
    else if (char === '[') openBrackets++;
    else if (char === ']') openBrackets--;
    
    if (openBraces === 0 && openBrackets === 0) {
      if (inKey) {
        if (char === ':') {
          inKey = false;
          currentKey = currentKey.trim().replace(/['"`]/g, ''); // Clean quotes
        } else {
          currentKey += char;
        }
      } else {
        if (char === ',') {
          // End of field definition
          if (currentKey.trim()) {
            fields.push({
              name: currentKey.trim(),
              definition: currentDef.trim()
            });
          }
          currentKey = '';
          currentDef = '';
          inKey = true;
        } else {
          currentDef += char;
        }
      }
    } else {
      if (!inKey) {
        currentDef += char;
      }
    }
  }
  
  // Add the last field if any
  if (currentKey.trim() && !inKey) {
    fields.push({
      name: currentKey.trim(),
      definition: currentDef.trim()
    });
  }
  
  return fields;
}

/**
 * Parses files in the repository to extract database schemas.
 */
export function parseDatabaseSchemas(files: ParsedFile[]): DbSchemaReport {
  const relationships: DbRelationship[] = [];

  // Track tables by name to prevent duplicates
  const tableMap = new Map<string, DbTable>();

  // Helper to add relationship safely
  const addRelationship = (source: string, target: string, sourceField: string, targetField: string) => {
    const relId = `${source}.${sourceField}->${target}.${targetField}`;
    if (!relationships.some(r => r.id === relId)) {
      relationships.push({
        id: relId,
        source,
        target,
        sourceField,
        targetField
      });
    }
  };

  for (const file of files) {
    const content = file.content;
    const extension = file.path.split('.').pop()?.toLowerCase();

    // 1. Prisma Parsing (.prisma)
    if (extension === 'prisma' || content.includes('datasource db') || content.includes('model ')) {
      // Find all models
      const modelRegex = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
      let match;
      while ((match = modelRegex.exec(content)) !== null) {
        const modelName = match[1];
        const modelBody = match[2];
        const fields: DbField[] = [];

        // Parse individual fields in the model
        const lines = modelBody.split('\n');
        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith('//') || line.startsWith('@@')) continue;

          // Prisma field: name type attributes
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            const fieldName = parts[0];
            const fieldType = parts[1];
            const rest = parts.slice(2).join(' ');

            const isPrimaryKey = rest.includes('@id');

            // Check if this is a relation helper field
            // e.g. author User @relation(fields: [authorId], references: [id])
            if (rest.includes('@relation')) {
              const fieldsMatch = rest.match(/fields:\s*\[([\w\s,]+)\]/);
              const refMatch = rest.match(/references:\s*\[([\w\s,]+)\]/);
              if (fieldsMatch && refMatch) {
                const sourceField = fieldsMatch[1].trim();
                const targetField = refMatch[1].trim();
                // Add relation info to the source field (which we'll find in the model)
                // We delay creating relationships until we resolve all tables, but we can do it directly if we know target
                addRelationship(modelName, fieldType.replace('?', '').replace('[]', ''), sourceField, targetField);
              }
              continue; // Do not render relation helper field as a column to avoid clutter
            }

            // Skip back-reference arrays in prisma schema (e.g. posts Post[]) to keep schema map neat
            if (fieldType.endsWith('[]')) {
              continue;
            }

            fields.push({
              name: fieldName,
              type: fieldType,
              isPrimaryKey,
              isForeignKey: false // Will mark this in a second pass if referenced
            });
          }
        }

        if (fields.length > 0) {
          tableMap.set(modelName, {
            id: modelName,
            sourceFile: file.path,
            fields
          });
        }
      }
    }

    // 2. SQL DDL Parsing (.sql)
    else if (extension === 'sql' || content.toLowerCase().includes('create table')) {
      const createTableRegex = /create\s+table\s+(?:if\s+not\s+exists\s+)?(\w+|`\w+`|"\w+")\s*\(([\s\S]*?)\)(?:\s*;|\s+ENGINE|$)/gi;
      let match;
      while ((match = createTableRegex.exec(content)) !== null) {
        const tableName = match[1].replace(/[`"]/g, '');
        const tableBody = match[2];
        const fields: DbField[] = [];

        const lines = tableBody.split(',');
        const fkDeclarations: { field: string; refTable: string; refField: string }[] = [];

        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith('--') || line.startsWith('/*')) continue;

          const upperLine = line.toUpperCase();

          // Check for FOREIGN KEY constraints
          // FOREIGN KEY (userId) REFERENCES Users(id)
          if (upperLine.startsWith('FOREIGN KEY') || upperLine.includes('FOREIGN KEY')) {
            const fkMatch = line.match(/FOREIGN\s+KEY\s*\(\s*(\w+|`\w+`|"\w+")\s*\)\s*REFERENCES\s*(\w+|`\w+`|"\w+")\s*\(\s*(\w+|`\w+`|"\w+")\s*\)/i);
            if (fkMatch) {
              fkDeclarations.push({
                field: fkMatch[1].replace(/[`"]/g, ''),
                refTable: fkMatch[2].replace(/[`"]/g, ''),
                refField: fkMatch[3].replace(/[`"]/g, '')
              });
            }
            continue;
          }

          // Check for PRIMARY KEY declarations at the end
          if (upperLine.startsWith('PRIMARY KEY')) {
            const pkMatch = line.match(/PRIMARY\s+KEY\s*\(\s*(\w+|`\w+`|"\w+")\s*\)/i);
            if (pkMatch) {
              const pkFieldName = pkMatch[1].replace(/[`"]/g, '');
              const existing = fields.find(f => f.name === pkFieldName);
              if (existing) existing.isPrimaryKey = true;
            }
            continue;
          }

          // Standard field definition
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            const fieldName = parts[0].replace(/[`"]/g, '');
            if (['CONSTRAINT', 'INDEX', 'KEY', 'UNIQUE'].includes(fieldName.toUpperCase())) continue;

            const fieldType = parts[1];
            const isPrimaryKey = upperLine.includes('PRIMARY KEY');
            
            // Inline references syntax: references Users(id)
            let isForeignKey = false;
            let refTable: string | undefined;
            let refField: string | undefined;
            if (upperLine.includes('REFERENCES')) {
              const inlineRefMatch = line.match(/REFERENCES\s*(\w+|`\w+`|"\w+")\s*\(\s*(\w+|`\w+`|"\w+")\s*\)/i);
              if (inlineRefMatch) {
                isForeignKey = true;
                refTable = inlineRefMatch[1].replace(/[`"]/g, '');
                refField = inlineRefMatch[2].replace(/[`"]/g, '');
                addRelationship(tableName, refTable, fieldName, refField);
              }
            }

            fields.push({
              name: fieldName,
              type: fieldType,
              isPrimaryKey,
              isForeignKey,
              refTable,
              refField
            });
          }
        }

        // Apply delayed FK declarations
        for (const fk of fkDeclarations) {
          const field = fields.find(f => f.name === fk.field);
          if (field) {
            field.isForeignKey = true;
            field.refTable = fk.refTable;
            field.refField = fk.refField;
          }
          addRelationship(tableName, fk.refTable, fk.field, fk.refField);
        }

        if (fields.length > 0) {
          tableMap.set(tableName, {
            id: tableName,
            sourceFile: file.path,
            fields
          });
        }
      }
    }

    // 3. Mongoose Schema Parsing (.js/.ts)
    else if (['js', 'ts'].includes(extension || '') && (content.includes('mongoose.Schema') || content.includes('new Schema') || content.includes('Schema('))) {
      const schemaInstantiationRegex = /(?:const|let|var)\s+(\w+)\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(/g;
      let match;
      
      while ((match = schemaInstantiationRegex.exec(content)) !== null) {
        const schemaVarName = match[1];
        const searchStartIndex = schemaInstantiationRegex.lastIndex;
        
        // Find matching outer object braces
        const objectResult = getOuterObject(content, searchStartIndex);
        if (!objectResult) continue;
        
        const cleanBodyText = stripComments(objectResult.body);
        const rawFields = parseTopLevelFields(cleanBodyText);
        const fields: DbField[] = [];
        
        // Find registered model name if any (e.g. mongoose.model('User', userSchema))
        const modelReg = new RegExp(`model\\s*\\(\\s*['"\`](\\w+)['"\`]\\s*,\\s*${schemaVarName}\\b`, 'i');
        const modelMatch = content.match(modelReg);
        const tableName = modelMatch ? modelMatch[1] : (schemaVarName.replace(/Schema$/i, '').replace(/Model$/i, ''));
        // Capitalize table name to match standard model naming convention
        const capitalizedTableName = tableName.charAt(0).toUpperCase() + tableName.slice(1);
        
        for (const rawField of rawFields) {
          const fieldName = rawField.name;
          const definition = rawField.definition;
          
          if (!fieldName || !definition) continue;
          
          // Determine type from definition
          let rawType = 'unknown';
          const typeMatch = definition.match(/type\s*:\s*([^,}]+)/i);
          if (typeMatch) {
            rawType = typeMatch[1].trim();
          } else {
            rawType = definition.trim();
          }
          // strip braces/brackets/quotes
          rawType = rawType.replace(/[{}\[\]'"`]/g, '').trim();
          
          const isPrimaryKey = fieldName === '_id' || fieldName === 'id';
          
          // Check for relationship ref
          let isForeignKey = false;
          let refTable: string | undefined;
          
          if (definition.includes('ref:')) {
            const refMatch = definition.match(/ref\s*:\s*['"`](\w+)['"`]/i);
            if (refMatch) {
              isForeignKey = true;
              refTable = refMatch[1];
              // Normalize refTable (capitalize)
              const capitalizedRefTable = refTable.charAt(0).toUpperCase() + refTable.slice(1);
              addRelationship(capitalizedTableName, capitalizedRefTable, fieldName, '_id');
            }
          }
          
          fields.push({
            name: fieldName,
            type: rawType || 'unknown',
            isPrimaryKey,
            isForeignKey,
            refTable: refTable ? (refTable.charAt(0).toUpperCase() + refTable.slice(1)) : undefined,
            refField: isForeignKey ? '_id' : undefined
          });
        }
        
        if (fields.length > 0) {
          tableMap.set(capitalizedTableName, {
            id: capitalizedTableName,
            sourceFile: file.path,
            fields
          });
        }
      }
    }

    // 4. SQLAlchemy Model Parsing (.py)
    else if (extension === 'py' && (content.includes('db.Model') || content.includes('declarative_base') || content.includes('__tablename__'))) {
      // Match Python Class model
      const classRegex = /class\s+(\w+)\s*\(([^)]+)\)\s*:\s*([\s\S]*?)(?=\nclass|\n\n\n|$)/g;
      let match;
      while ((match = classRegex.exec(content)) !== null) {
        const className = match[1];
        const classBody = match[3];
        const fields: DbField[] = [];

        // Check for tablename
        let tableName = className;
        const tablenameMatch = classBody.match(/__tablename__\s*=\s*['"`](\w+)['"`]/);
        if (tablenameMatch) {
          tableName = tablenameMatch[1];
        }

        const lines = classBody.split('\n');
        for (let line of lines) {
          line = line.trim();
          if (!line || line.startsWith('#')) continue;

          // Match colName = Column(Integer, primary_key=True)
          const colMatch = line.match(/^(\w+)\s*=\s*(?:db\.)?Column\s*\(([\s\S]*?)\)/);
          if (colMatch) {
            const colName = colMatch[1];
            const colArgs = colMatch[2];
            const typePart = colArgs.split(',')[0].trim();

            const isPrimaryKey = colArgs.includes('primary_key=True');
            let isForeignKey = false;
            let refTable: string | undefined;
            let refField: string | undefined;

            // Check ForeignKey('users.id')
            if (colArgs.includes('ForeignKey')) {
              const fkMatch = colArgs.match(/ForeignKey\s*\(\s*['"`](\w+)\.(\w+)['"`]\s*\)/);
              if (fkMatch) {
                isForeignKey = true;
                refTable = fkMatch[1];
                refField = fkMatch[2];
                addRelationship(tableName, refTable, colName, refField);
              }
            }

            fields.push({
              name: colName,
              type: typePart,
              isPrimaryKey,
              isForeignKey,
              refTable,
              refField
            });
          }

          // Match relationships
          // posts = relationship('Post', backref='author')
          const relMatch = line.match(/^(\w+)\s*=\s*(?:db\.)?relationship\s*\(\s*['"`](\w+)['"`]/);
          if (relMatch) {
            // SQLAlchemy relationship link
            // Often there is a ForeignKey defined, so relationship is just sugar. We only draw it if no ForeignKey relationship was added.
            // Let's add it only if there is no existing relationship between these two tables.
            const targetTable = relMatch[2];
            const existingRel = relationships.some(r => 
              (r.source === tableName && r.target === targetTable) || 
              (r.source === targetTable && r.target === tableName)
            );
            if (!existingRel) {
              addRelationship(tableName, targetTable, relMatch[1], 'id');
            }
          }
        }

        if (fields.length > 0) {
          tableMap.set(tableName, {
            id: tableName,
            sourceFile: file.path,
            fields
          });
        }
      }
    }
  }

  // Second pass: cross-reference tables to identify foreign keys that were defined target-side
  // and sanitize relationship references (filter out links to tables that don't exist in our map)
  const validRelationships = relationships.filter(rel => {
    // Check if source and target exist in our tables list
    const sourceTable = tableMap.get(rel.source);
    const targetTable = tableMap.get(rel.target);

    if (sourceTable && targetTable) {
      // Mark source field as ForeignKey
      const field = sourceTable.fields.find(f => f.name === rel.sourceField);
      if (field) {
        field.isForeignKey = true;
        field.refTable = rel.target;
        field.refField = rel.targetField;
      }
      return true;
    }
    return false;
  });

  return {
    tables: Array.from(tableMap.values()),
    relationships: validRelationships
  };
}

/**
 * Returns a high-fidelity mock schema dataset for demo mode.
 */
export function GET_DEMO_SCHEMA(): DbSchemaReport {
  return {
    tables: [
      {
        id: 'User',
        sourceFile: 'schema.prisma',
        fields: [
          { name: 'id', type: 'Int', isPrimaryKey: true, isForeignKey: false },
          { name: 'email', type: 'String', isPrimaryKey: false, isForeignKey: false },
          { name: 'passwordHash', type: 'String', isPrimaryKey: false, isForeignKey: false },
          { name: 'name', type: 'String', isPrimaryKey: false, isForeignKey: false },
          { name: 'role', type: 'Role', isPrimaryKey: false, isForeignKey: false },
          { name: 'createdAt', type: 'DateTime', isPrimaryKey: false, isForeignKey: false }
        ]
      },
      {
        id: 'Order',
        sourceFile: 'schema.prisma',
        fields: [
          { name: 'id', type: 'Int', isPrimaryKey: true, isForeignKey: false },
          { name: 'userId', type: 'Int', isPrimaryKey: false, isForeignKey: true, refTable: 'User', refField: 'id' },
          { name: 'status', type: 'OrderStatus', isPrimaryKey: false, isForeignKey: false },
          { name: 'totalAmount', type: 'Decimal', isPrimaryKey: false, isForeignKey: false },
          { name: 'createdAt', type: 'DateTime', isPrimaryKey: false, isForeignKey: false }
        ]
      },
      {
        id: 'OrderItem',
        sourceFile: 'schema.prisma',
        fields: [
          { name: 'id', type: 'Int', isPrimaryKey: true, isForeignKey: false },
          { name: 'orderId', type: 'Int', isPrimaryKey: false, isForeignKey: true, refTable: 'Order', refField: 'id' },
          { name: 'productId', type: 'Int', isPrimaryKey: false, isForeignKey: true, refTable: 'Product', refField: 'id' },
          { name: 'quantity', type: 'Int', isPrimaryKey: false, isForeignKey: false },
          { name: 'price', type: 'Decimal', isPrimaryKey: false, isForeignKey: false }
        ]
      },
      {
        id: 'Product',
        sourceFile: 'schema.prisma',
        fields: [
          { name: 'id', type: 'Int', isPrimaryKey: true, isForeignKey: false },
          { name: 'name', type: 'String', isPrimaryKey: false, isForeignKey: false },
          { name: 'price', type: 'Decimal', isPrimaryKey: false, isForeignKey: false },
          { name: 'stockCount', type: 'Int', isPrimaryKey: false, isForeignKey: false },
          { name: 'categoryId', type: 'Int', isPrimaryKey: false, isForeignKey: true, refTable: 'Category', refField: 'id' }
        ]
      },
      {
        id: 'Category',
        sourceFile: 'schema.prisma',
        fields: [
          { name: 'id', type: 'Int', isPrimaryKey: true, isForeignKey: false },
          { name: 'name', type: 'String', isPrimaryKey: false, isForeignKey: false },
          { name: 'description', type: 'String', isPrimaryKey: false, isForeignKey: false }
        ]
      },
      {
        id: 'AuditLog',
        sourceFile: 'schema.prisma',
        fields: [
          { name: 'id', type: 'Int', isPrimaryKey: true, isForeignKey: false },
          { name: 'action', type: 'String', isPrimaryKey: false, isForeignKey: false },
          { name: 'timestamp', type: 'DateTime', isPrimaryKey: false, isForeignKey: false }
        ]
      }
    ],
    relationships: [
      {
        id: 'Order.userId->User.id',
        source: 'Order',
        target: 'User',
        sourceField: 'userId',
        targetField: 'id'
      },
      {
        id: 'OrderItem.orderId->Order.id',
        source: 'OrderItem',
        target: 'Order',
        sourceField: 'orderId',
        targetField: 'id'
      },
      {
        id: 'OrderItem.productId->Product.id',
        source: 'OrderItem',
        target: 'Product',
        sourceField: 'productId',
        targetField: 'id'
      },
      {
        id: 'Product.categoryId->Category.id',
        source: 'Product',
        target: 'Category',
        sourceField: 'categoryId',
        targetField: 'id'
      }
    ]
  };
}
