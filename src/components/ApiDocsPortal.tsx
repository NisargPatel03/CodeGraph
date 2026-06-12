import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Play, Copy, Check, Code, Sparkles, Terminal, BookOpen, Search, AlertTriangle, Server, RefreshCw } from 'lucide-react';
import type { ParsedFile } from '../utils/repoParser';
import { aiExtractEndpoints } from '../utils/aiHelper';
import type { ApiEndpoint, ApiDocsReport } from '../utils/aiHelper';

interface ApiDocsPortalProps {
  files: ParsedFile[];
  apiKey: string;
}

export const ApiDocsPortal: React.FC<ApiDocsPortalProps> = ({ files, apiKey }) => {
  const [report, setReport] = useState<ApiDocsReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<ApiEndpoint | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Interactive test states
  const [serverUrl, setServerUrl] = useState('http://localhost:3000');
  const [paramValues, setParamValues] = useState<Record<string, string>>({});
  const [bodyValue, setBodyValue] = useState('');
  const [customHeaders, setCustomHeaders] = useState('Content-Type: application/json');
  const [useCorsProxy, setUseCorsProxy] = useState(false);
  const [corsProxyPrefix, setCorsProxyPrefix] = useState('https://api.allorigins.win/raw?url=');
  const [showCorsHelp, setShowCorsHelp] = useState(false);
  
  // Response states
  const [executing, setExecuting] = useState(false);
  const [testResponse, setTestResponse] = useState<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
  } | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // Trigger scan on component mount if files are available
  const triggerScan = async () => {
    setLoading(true);
    setError(null);
    setSelectedEndpoint(null);
    try {
      const res = await aiExtractEndpoints(files, apiKey);
      setReport(res);
      if (res.endpoints.length > 0) {
        setSelectedEndpoint(res.endpoints[0]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to analyze API routing structure.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (files.length > 0 && !report && !loading) {
      triggerScan();
    }
  }, [files]);

  // Set default body and parameter forms when selected endpoint changes
  useEffect(() => {
    if (selectedEndpoint) {
      const defaults: Record<string, string> = {};
      selectedEndpoint.parameters?.forEach(p => {
        if (p.in !== 'body') {
          // If query param lists pagination or limit
          if (p.name === 'limit') defaults[p.name] = '10';
          else if (p.name === 'offset') defaults[p.name] = '0';
          else defaults[p.name] = p.type === 'number' ? '1' : `sample_${p.name}`;
        }
      });
      setParamValues(defaults);

      const bodyParam = selectedEndpoint.parameters?.find(p => p.in === 'body');
      if (bodyParam && bodyParam.schema) {
        setBodyValue(JSON.stringify(bodyParam.schema, null, 2));
      } else {
        setBodyValue('');
      }

      setTestResponse(null);
      setTestError(null);
    }
  }, [selectedEndpoint]);

  // Filtered endpoints list
  const filteredEndpoints = useMemo(() => {
    if (!report) return [];
    return report.endpoints.filter(e => {
      const search = searchQuery.toLowerCase();
      return (
        e.path.toLowerCase().includes(search) ||
        e.method.toLowerCase().includes(search) ||
        e.description.toLowerCase().includes(search) ||
        e.filePath.toLowerCase().includes(search)
      );
    });
  }, [report, searchQuery]);

  // Group endpoints by file path
  const groupedEndpoints = useMemo(() => {
    const groups: Record<string, ApiEndpoint[]> = {};
    filteredEndpoints.forEach(e => {
      if (!groups[e.filePath]) groups[e.filePath] = [];
      groups[e.filePath].push(e);
    });
    return groups;
  }, [filteredEndpoints]);

  // Dynamic curl command compiler
  const compiledCurl = useMemo(() => {
    if (!selectedEndpoint) return '';
    
    let url = `${serverUrl}${selectedEndpoint.path}`;
    
    // Replace path variables
    selectedEndpoint.parameters?.forEach(p => {
      if (p.in === 'path') {
        const val = paramValues[p.name] || `:${p.name}`;
        url = url.replace(`:${p.name}`, val).replace(`{${p.name}}`, val);
      }
    });

    // Append query params
    const queries = selectedEndpoint.parameters
      ?.filter(p => p.in === 'query' && paramValues[p.name])
      .map(p => `${p.name}=${encodeURIComponent(paramValues[p.name])}`);
    
    if (queries && queries.length > 0) {
      url += `?${queries.join('&')}`;
    }

    let finalUrl = url;
    if (useCorsProxy && corsProxyPrefix) {
      if (corsProxyPrefix.endsWith('=') || corsProxyPrefix.endsWith('?')) {
        finalUrl = `${corsProxyPrefix}${encodeURIComponent(url)}`;
      } else {
        finalUrl = `${corsProxyPrefix}${url}`;
      }
    }

    let curl = `curl -X ${selectedEndpoint.method} "${finalUrl}"`;

    // Append custom headers
    customHeaders.split('\n').forEach(h => {
      const trimmed = h.trim();
      if (trimmed) curl += ` \\\n  -H "${trimmed}"`;
    });

    // Append body payload
    if (['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && bodyValue) {
      const singleLineBody = JSON.stringify(JSON.parse(bodyValue || '{}'));
      curl += ` \\\n  -d '${singleLineBody}'`;
    }

    return curl;
  }, [selectedEndpoint, serverUrl, paramValues, bodyValue, customHeaders, useCorsProxy, corsProxyPrefix]);

  const copyCurlToClipboard = () => {
    navigator.clipboard.writeText(compiledCurl);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  // Execute interactive fetch
  const handleTestRequest = async () => {
    if (!selectedEndpoint) return;
    setExecuting(true);
    setTestResponse(null);
    setTestError(null);

    let url = `${serverUrl}${selectedEndpoint.path}`;
    
    // Replace path variables
    selectedEndpoint.parameters?.forEach(p => {
      if (p.in === 'path') {
        const val = paramValues[p.name] || `:${p.name}`;
        url = url.replace(`:${p.name}`, val).replace(`{${p.name}}`, val);
      }
    });

    // Append query params
    const queries = selectedEndpoint.parameters
      ?.filter(p => p.in === 'query' && paramValues[p.name])
      .map(p => `${p.name}=${encodeURIComponent(paramValues[p.name])}`);
    
    if (queries && queries.length > 0) {
      url += `?${queries.join('&')}`;
    }

    let finalUrl = url;
    if (useCorsProxy && corsProxyPrefix) {
      if (corsProxyPrefix.endsWith('=') || corsProxyPrefix.endsWith('?')) {
        finalUrl = `${corsProxyPrefix}${encodeURIComponent(url)}`;
      } else {
        finalUrl = `${corsProxyPrefix}${url}`;
      }
    }

    const headers: Record<string, string> = {};
    customHeaders.split('\n').forEach(h => {
      const parts = h.split(':');
      if (parts.length >= 2) {
        headers[parts[0].trim()] = parts.slice(1).join(':').trim();
      }
    });

    const options: RequestInit = {
      method: selectedEndpoint.method,
      headers
    };

    if (['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && bodyValue) {
      try {
        // Validate request body json
        JSON.parse(bodyValue);
        options.body = bodyValue;
      } catch (e) {
        setTestError('Malformed Request Body: Invalid JSON syntax.');
        setExecuting(false);
        return;
      }
    }

    try {
      const res = await fetch(finalUrl, options);
      const text = await res.text();
      const resHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });

      setTestResponse({
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        body: text
      });
    } catch (err: any) {
      console.warn('Endpoint request failed:', err);
      setTestError(err?.message || 'Network Error: Connection refused or CORS configuration blocked this request.');
    } finally {
      setExecuting(false);
    }
  };

  const getMethodBadgeClass = (method: string) => {
    switch (method) {
      case 'GET': return 'badge-get';
      case 'POST': return 'badge-post';
      case 'PUT': return 'badge-put';
      case 'PATCH': return 'badge-patch';
      case 'DELETE': return 'badge-delete';
      default: return 'badge-options';
    }
  };

  const formatJson = (jsonStr: string) => {
    try {
      return JSON.stringify(JSON.parse(jsonStr), null, 2);
    } catch (e) {
      return jsonStr;
    }
  };

  // Simple markdown renderer for summary description
  const renderSummaryMarkdown = (text: string) => {
    if (!text) return null;
    return text.split('\n').map((line, idx) => {
      if (line.startsWith('## ')) {
        return <h2 key={idx} style={{ color: 'var(--color-primary)', marginTop: '20px', fontSize: '1.25rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '6px' }}>{line.replace('## ', '')}</h2>;
      }
      if (line.startsWith('### ')) {
        return <h3 key={idx} style={{ color: 'var(--color-secondary)', marginTop: '16px', fontSize: '1.05rem' }}>{line.replace('### ', '')}</h3>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={idx} style={{ marginLeft: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '4px 0' }}>{line.substring(2)}</li>;
      }
      if (line.trim().startsWith('1. ') || line.trim().startsWith('2. ') || line.trim().startsWith('3. ')) {
        return <li key={idx} style={{ marginLeft: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)', listStyleType: 'decimal' }}>{line.substring(3)}</li>;
      }
      if (line.trim() === '') return <div key={idx} style={{ height: '8px' }} />;
      return <p key={idx} style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: '4px 0' }}>{line}</p>;
    });
  };

  return (
    <div className="api-docs-viewport" style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}>
      
      {/* Sidebar endpoint directory */}
      <aside className="docs-sidebar" style={{ width: '320px', borderRight: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
        
        <div style={{ padding: '16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <BookOpen size={16} style={{ color: 'var(--color-primary)' }} />
              API Directory
            </span>
            <button
              onClick={triggerScan}
              disabled={loading}
              className="refresh-btn"
              title="Rescan project API routes"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <RefreshCw size={13} className={loading ? 'spin-anim' : ''} />
            </button>
          </div>
          
          <div className="search-box" style={{ width: '100%' }}>
            <Search size={13} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search endpoints..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '40px 10px' }}>
              <span className="spinner" style={{ width: '24px', height: '24px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>Analyzing controllers & route registries...</span>
            </div>
          ) : error ? (
            <div style={{ color: '#ef4444', fontSize: '0.78rem', padding: '16px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)', borderRadius: '6px', margin: '4px' }}>
              <AlertTriangle size={16} style={{ marginBottom: '6px' }} />
              <div>{error}</div>
            </div>
          ) : filteredEndpoints.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textAlign: 'center', fontStyle: 'italic', padding: '40px 10px' }}>
              No routes detected in codebase files.
            </div>
          ) : (
            Object.keys(groupedEndpoints).map(filePath => (
              <div key={filePath} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', wordBreak: 'break-all' }}>
                  <Code size={11} style={{ flexShrink: 0 }} />
                  {filePath.split('/').pop()}
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {groupedEndpoints[filePath].map((ep, idx) => {
                    const isSelected = selectedEndpoint && selectedEndpoint.path === ep.path && selectedEndpoint.method === ep.method;
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedEndpoint(ep)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderRadius: '6px',
                          background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                          border: isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'all 0.2s ease',
                        }}
                        className="endpoint-list-item"
                      >
                        <span className={`method-badge ${getMethodBadgeClass(ep.method)}`}>
                          {ep.method}
                        </span>
                        <span style={{ fontSize: '0.78rem', color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)' }}>
                          {ep.path}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main interactive documentation pane */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(0,0,0,0.05)' }}>
        {selectedEndpoint ? (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            
            {/* Left Column: Docs details & parameters forms */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', borderRight: '1px solid var(--panel-border)' }}>
              
              {/* Endpoint Heading */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                <span className={`method-badge large ${getMethodBadgeClass(selectedEndpoint.method)}`}>
                  {selectedEndpoint.method}
                </span>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', margin: 0, wordBreak: 'break-all' }}>
                  {selectedEndpoint.path}
                </h2>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '16px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '16px' }}>
                <span style={{ background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '4px' }}>
                  File: <strong style={{ color: 'var(--text-secondary)' }}>{selectedEndpoint.filePath}:{selectedEndpoint.line}</strong>
                </span>
                {selectedEndpoint.controllerName && (
                  <span style={{ background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: '4px' }}>
                    Handler: <strong style={{ color: 'var(--text-secondary)' }}>{selectedEndpoint.controllerName}()</strong>
                  </span>
                )}
              </div>

              {/* Description */}
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--panel-border)', borderRadius: '8px', padding: '16px', marginBottom: '24px', lineHeight: '1.5' }}>
                {selectedEndpoint.description}
              </div>

              {/* Server URL Configure */}
              <div className="glass-panel" style={{ padding: '16px', border: '1px solid var(--panel-border)', borderRadius: '8px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Server size={13} />
                    API SERVER URL CONFIG
                  </label>
                  <button
                    onClick={() => setShowCorsHelp(true)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-secondary)',
                      fontSize: '0.7rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0,
                      fontWeight: 600
                    }}
                    title="How to handle local CORS issues"
                  >
                    <AlertTriangle size={12} style={{ color: 'var(--color-warning)' }} />
                    CORS Guide
                  </button>
                </div>
                
                <input
                  type="text"
                  className="cyber-input"
                  placeholder="e.g. http://localhost:3000"
                  value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--panel-border)', paddingTop: '10px', marginTop: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="use-cors-proxy-checkbox"
                      checked={useCorsProxy}
                      onChange={e => setUseCorsProxy(e.target.checked)}
                      style={{ cursor: 'pointer', accentColor: 'var(--color-primary)' }}
                    />
                    <label htmlFor="use-cors-proxy-checkbox" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500 }}>
                      Route via CORS Proxy client (Bypass local/remote CORS blocks)
                    </label>
                  </div>

                  {useCorsProxy && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '22px' }}>
                      <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>CORS Proxy Prefix URL</label>
                      <input
                        type="text"
                        className="cyber-input"
                        placeholder="e.g. https://api.allorigins.win/raw?url="
                        value={corsProxyPrefix}
                        onChange={e => setCorsProxyPrefix(e.target.value)}
                        style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Path/Query parameters list */}
              {selectedEndpoint.parameters && selectedEndpoint.parameters.filter(p => p.in !== 'body').length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', marginBottom: '12px' }}>
                    Request Parameters
                  </h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {selectedEndpoint.parameters.filter(p => p.in !== 'body').map(param => (
                      <div key={param.name} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '16px', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {param.name}
                            {param.required && <span style={{ color: '#ef4444' }}>*</span>}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                            {param.in} ({param.type})
                          </div>
                        </div>
                        <input
                          type="text"
                          className="cyber-input"
                          placeholder={param.description || `Enter value...`}
                          value={paramValues[param.name] || ''}
                          onChange={e => setParamValues(prev => ({ ...prev, [param.name]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Custom Headers */}
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', marginBottom: '12px' }}>
                  HTTP Request Headers
                </h3>
                <textarea
                  className="cyber-input"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', minHeight: '60px' }}
                  rows={2}
                  value={customHeaders}
                  onChange={e => setCustomHeaders(e.target.value)}
                  placeholder="Content-Type: application/json"
                />
              </div>

              {/* Body parameters editor */}
              {['POST', 'PUT', 'PATCH'].includes(selectedEndpoint.method) && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', marginBottom: '12px' }}>
                    JSON Request Body Payload
                  </h3>
                  <textarea
                    className="cyber-input"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', minHeight: '140px' }}
                    rows={6}
                    value={bodyValue}
                    onChange={e => setBodyValue(e.target.value)}
                    placeholder="{}"
                  />
                </div>
              )}

              {/* Response specs specifications */}
              {selectedEndpoint.responses && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)', borderBottom: '1px solid var(--panel-border)', paddingBottom: '8px', marginBottom: '12px' }}>
                    Response Specifications
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {selectedEndpoint.responses.map((res, i) => (
                      <div key={i} className="glass-panel" style={{ padding: '14px', border: '1px solid var(--panel-border)', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: res.status >= 200 && res.status < 300 ? '#10B981' : '#EF4444' }}>
                            {res.status}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {res.description}
                          </span>
                        </div>
                        {res.schema && (
                          <pre style={{ margin: 0, padding: '8px', background: 'rgba(0,0,0,0.25)', borderRadius: '4px', fontSize: '0.7rem', color: 'var(--text-muted)', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
                            {JSON.stringify(res.schema, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Right Column: Execution tester & output console */}
            <div style={{ width: '400px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.1)', flexShrink: 0 }}>
              
              {/* Dynamic Curl copy tool */}
              <div style={{ padding: '20px', borderBottom: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.15)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Curl Request Generator
                  </span>
                  <button
                    onClick={copyCurlToClipboard}
                    className="copy-curl-btn"
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--panel-border)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {copiedCurl ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedCurl ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <pre style={{ margin: 0, padding: '10px', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', fontSize: '0.68rem', color: 'var(--color-secondary)', overflowX: 'auto', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {compiledCurl}
                </pre>
              </div>

              {/* Execution Console */}
              <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Terminal size={13} />
                    Interactive Console
                  </span>
                </div>

                <button
                  className="cyber-button"
                  onClick={handleTestRequest}
                  disabled={executing}
                  style={{
                    padding: '10px',
                    fontSize: '0.82rem',
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    borderColor: 'var(--color-primary)',
                    boxShadow: '0 0 10px rgba(99, 102, 241, 0.1)'
                  }}
                >
                  {executing ? (
                    <>
                      <span className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      <span>Sending Request...</span>
                    </>
                  ) : (
                    <>
                      <Play size={13} fill="currentColor" />
                      <span>Send Request</span>
                    </>
                  )}
                </button>

                <div style={{ flex: 1, background: '#05070f', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  
                  {executing ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      Awaiting response from {serverUrl}...
                    </div>
                  ) : testError ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', color: '#f87171', overflowY: 'auto' }}>
                      <span style={{ fontWeight: 700 }}>⚠️ Request Failed</span>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.7rem', color: '#ef4444' }}>
                        {testError}
                      </pre>
                      {(testError.includes('CORS') || testError.toLowerCase().includes('network') || testError.toLowerCase().includes('fetch')) && (
                        <button
                          onClick={() => setShowCorsHelp(true)}
                          style={{
                            alignSelf: 'flex-start',
                            background: 'rgba(244, 63, 94, 0.1)',
                            border: '1px solid rgba(244, 63, 94, 0.2)',
                            color: '#fb7185',
                            borderRadius: '4px',
                            padding: '4px 8px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            marginTop: '4px',
                            fontWeight: 600
                          }}
                        >
                          Troubleshoot CORS / Connection Errors
                        </button>
                      )}
                    </div>
                  ) : testResponse ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      {/* Status header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '6px', marginBottom: '8px', flexShrink: 0 }}>
                        <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                        <strong style={{ color: testResponse.status >= 200 && testResponse.status < 300 ? '#10B981' : '#ef4444' }}>
                          {testResponse.status} {testResponse.statusText}
                        </strong>
                      </div>

                      {/* Response Body console */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginBottom: '4px', textTransform: 'uppercase' }}>Response Body</span>
                        <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(0,0,0,0.3)', padding: '8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.03)' }}>
                          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.7rem', color: 'rgba(255,255,255,0.95)' }}>
                            {formatJson(testResponse.body)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                      Console Output. Click 'Send Request' to inspect HTTP response payload.
                    </div>
                  )}

                </div>

              </div>

            </div>

          </div>
        ) : (
          /* Welcome/Overview Screen if no endpoint selected */
          <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '16px' }}>
                <Sparkles size={28} style={{ color: 'var(--color-primary)' }} />
                <div>
                  <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>API & Route Documentation Portal</h1>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Gemini route parsing audit & static routing analyzer.
                  </p>
                </div>
              </div>

              {report?.summary ? (
                <div className="glass-panel" style={{ padding: '24px', border: '1px solid var(--panel-border)', borderRadius: '8px', background: 'rgba(255,255,255,0.01)' }}>
                  {renderSummaryMarkdown(report.summary)}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Awaiting scan analyzer initialization...
                </div>
              )}

              {report && report.endpoints.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <h3 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-primary)' }}>
                    Extracted Endpoint Map ({report.endpoints.length})
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                    {report.endpoints.slice(0, 6).map((ep, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedEndpoint(ep)}
                        style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--panel-border)',
                          borderRadius: '6px',
                          padding: '10px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                      >
                        <span className={`method-badge ${getMethodBadgeClass(ep.method)}`}>
                          {ep.method}
                        </span>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{ep.path}</div>
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{ep.filePath.split('/').pop()}</div>
                        </div>
                      </div>
                    ))}
                    {report.endpoints.length > 6 && (
                      <div
                        style={{
                          background: 'rgba(255, 255, 255, 0.01)',
                          border: '1px dashed var(--panel-border)',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.78rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        + {report.endpoints.length - 6} more endpoints in directory
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}
      </main>

      {showCorsHelp && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '650px',
            maxHeight: '80vh',
            overflow: 'hidden',
            background: 'var(--panel-bg)',
            border: '1px solid var(--panel-border)',
            borderRadius: '12px',
            boxShadow: '0 0 30px rgba(99, 102, 241, 0.2)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
                CORS Troubleshooting Guide
              </span>
              <button
                onClick={() => setShowCorsHelp(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--panel-border)',
                  color: 'var(--text-secondary)',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>

            {/* Content */}
            <div style={{ padding: '20px 20px 32px 20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '0.82rem', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
              
              <div>
                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 6px 0', fontSize: '0.9rem', fontWeight: 600 }}>Why do CORS errors happen?</h4>
                <p style={{ margin: 0 }}>
                  Browsers enforce the <strong>Same-Origin Policy</strong>. Because CodeGraph runs on port <code>5173</code> (or via a public web origin), the browser blocks direct requests to your local backend (e.g., port <code>3000</code>) unless the backend explicitly responds with headers authorizing this origin.
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: 600 }}>Option A: Enable CORS in your Backend (Recommended)</h4>
                <p style={{ margin: '0 0 10px 0' }}>
                  Inject CORS headers into your server response middleware. Examples:
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>Node.js / Express:</span>
                    <pre style={{ margin: '4px 0 0 0', padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {`const cors = require('cors');\napp.use(cors()); // Allow all origins`}
                    </pre>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-secondary)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>Python / Flask:</span>
                    <pre style={{ margin: '4px 0 0 0', padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {`from flask_cors import CORS\nCORS(app) # Enable CORS for all routes`}
                    </pre>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: 600 }}>Option B: Run a Local CORS Proxy</h4>
                <p style={{ margin: '0 0 8px 0' }}>
                  You can spin up a local proxy server that intercepts requests and automatically appends CORS headers:
                </p>
                <pre style={{ margin: '0 0 8px 0', padding: '8px', background: 'rgba(0,0,0,0.3)', borderRadius: '4px', fontSize: '0.7rem', color: 'var(--color-secondary)', fontFamily: 'var(--font-mono)' }}>
                  npx local-cors-proxy --proxyUrl http://localhost:3000
                </pre>
                <p style={{ margin: 0 }}>
                  This launches a proxy at <code>http://localhost:8010</code>. Point the <strong>API Server URL Config</strong> in the docs panel to <code>http://localhost:8010</code>.
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '16px' }}>
                <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: 600 }}>Option C: Use a Public CORS Proxy (Remote APIs Only)</h4>
                <p style={{ margin: 0 }}>
                  Enable the <strong>Route via CORS Proxy client</strong> toggle in the Server URL configuration panel. This routes your request through a web-based CORS helper (like <code>allorigins</code>).
                  <br />
                  <span style={{ color: 'var(--color-warning)', fontSize: '0.75rem', display: 'inline-block', marginTop: '6px' }}>
                    ⚠️ Note: Public web proxies cannot access your local loopback address (<code>localhost</code> / <code>127.0.0.1</code>). Use Option A or B for local dev servers.
                  </span>
                </p>
              </div>

            </div>
          </div>
        </div>,
        document.body
      )}
      
    </div>
  );
};
