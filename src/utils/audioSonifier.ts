class AudioSonifier {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.3; // Default 30% volume
  private enabled: boolean = false; // Muted by default to avoid annoying user

  constructor() {
    try {
      const savedEnabled = localStorage.getItem('codegraph-audio-enabled');
      this.enabled = savedEnabled === 'true';
      const savedVolume = localStorage.getItem('codegraph-audio-volume');
      if (savedVolume !== null) {
        this.volume = parseFloat(savedVolume);
      }
    } catch (e) {
      console.warn('LocalStorage not available in audio constructor:', e);
    }
  }

  private init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    } catch (err) {
      console.error('Failed to initialize AudioContext:', err);
    }
  }

  public setEnabled(val: boolean) {
    this.enabled = val;
    try {
      localStorage.setItem('codegraph-audio-enabled', String(val));
    } catch (e) {}

    if (val) {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } else {
      if (this.ctx && this.ctx.state === 'running') {
        this.ctx.suspend();
      }
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    try {
      localStorage.setItem('codegraph-audio-volume', String(this.volume));
    } catch (e) {}

    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public playClick() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, t);
    osc.frequency.exponentialRampToValueAtTime(250, t + 0.04);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.05);

    setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
    }, 100);
  }

  public playNodeHover(node: any) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    const t = this.ctx.currentTime;

    // Check if circular dependency / cyclic warning node
    const isCyclic = node.isCyclic || (node.type === 'circular_dep') || (node.severity && node.type === 'circular_dep');
    
    // Determine complexity metric: size (LOC) or complexity score
    const size = node.size || 0;
    const complexity = node.complexity || 0;
    const loc = node.content ? node.content.split('\n').length : (size > 0 ? Math.floor(size / 100) : 0);
    
    const isComplex = loc > 300 || complexity > 25 || node.severity === 'critical';

    if (isCyclic) {
      // 1. Dissonant interval (minor second) for circular dependencies
      const baseFreq = 220; // A3
      const freq2 = 233.08; // A#3 (Dissonant minor second)

      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      const gain2 = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc1.type = 'triangle';
      osc2.type = 'sawtooth';

      osc1.frequency.setValueAtTime(baseFreq, t);
      osc2.frequency.setValueAtTime(freq2, t);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.exponentialRampToValueAtTime(150, t + 0.35);

      gain1.gain.setValueAtTime(0.12, t);
      gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      gain2.gain.setValueAtTime(0.06, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc1.connect(gain1);
      osc2.connect(gain2);
      gain1.connect(filter);
      gain2.connect(filter);
      filter.connect(this.masterGain);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 0.4);
      osc2.stop(t + 0.4);

      setTimeout(() => {
        osc1.disconnect();
        osc2.disconnect();
        gain1.disconnect();
        gain2.disconnect();
        filter.disconnect();
      }, 500);

    } else if (isComplex) {
      // 2. Complex synthesizer sweep for complex, high-risk codebases
      const osc = this.ctx.createOscillator();
      const subOsc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      subOsc.type = 'triangle';

      // Base pitch rises slightly with file size but remains solid and beefy
      const baseFreq = 110 + Math.min(complexity * 4, 150);
      osc.frequency.setValueAtTime(baseFreq, t);
      subOsc.frequency.setValueAtTime(baseFreq / 2, t); // Sub-bass octave

      filter.type = 'lowpass';
      filter.Q.setValueAtTime(6, t);
      filter.frequency.setValueAtTime(180, t);
      filter.frequency.exponentialRampToValueAtTime(1800, t + 0.08);
      filter.frequency.exponentialRampToValueAtTime(120, t + 0.45);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      osc.connect(filter);
      subOsc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      subOsc.start(t);
      osc.stop(t + 0.55);
      subOsc.stop(t + 0.55);

      setTimeout(() => {
        osc.disconnect();
        subOsc.disconnect();
        gain.disconnect();
        filter.disconnect();
      }, 700);

    } else {
      // 3. Soft, clean, high-pitched sine chime for small/clean files
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      // Mapped higher (smaller file = higher, cleaner pitch)
      const freqFactor = Math.max(0, 100 - loc);
      const frequency = 480 + freqFactor * 2.5;
      osc.frequency.setValueAtTime(frequency, t);

      gain.gain.setValueAtTime(0.2, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.25);

      setTimeout(() => {
        osc.disconnect();
        gain.disconnect();
      }, 350);
    }
  }

  public playTraceStep(stepIndex: number, _totalSteps: number, _sourceNode: string, _targetNode: string) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    const t = this.ctx.currentTime;

    // Major pentatonic scale for clean, ascending sequence chimes
    // Notes: C4, D4, E4, G4, A4, C5, D5, E5, G5, A5
    const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99, 880.00];
    const freq = scale[stepIndex % scale.length];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    // Add subtle frequency glide
    osc.frequency.exponentialRampToValueAtTime(freq * 1.012, t + 0.2);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.25);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.3);

    setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
      filter.disconnect();
    }, 400);
  }

  public playSimulationStart() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(750, t + 0.45);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(2000, t + 0.45);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.15, t + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.5);

    setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
      filter.disconnect();
    }, 600);
  }

  public playSimulationStop() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.35);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.4);

    setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
    }, 500);
  }

  public playJoin() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    // Digital ascending arpeggio: C5 (523.25) -> G5 (783.99) -> C6 (1046.50)
    osc1.frequency.setValueAtTime(523.25, t);
    osc1.frequency.setValueAtTime(783.99, t + 0.08);
    osc1.frequency.setValueAtTime(1046.50, t + 0.16);

    osc2.frequency.setValueAtTime(261.63, t); // low warm support note

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.setValueAtTime(0.12, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.4);
    osc2.stop(t + 0.4);

    setTimeout(() => {
      osc1.disconnect();
      osc2.disconnect();
      gain.disconnect();
    }, 500);
  }

  public playLeave() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Descending slide: C5 (523.25) down to C4 (261.63)
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.exponentialRampToValueAtTime(261.63, t + 0.3);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.4);

    setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
    }, 500);
  }

  public playCollaboratorSelect() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // High soft ping: E6 (1318.51)
    osc.frequency.setValueAtTime(1318.51, t);
    
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.2);

    setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
    }, 300);
  }
}

export const audioSonifier = new AudioSonifier();

