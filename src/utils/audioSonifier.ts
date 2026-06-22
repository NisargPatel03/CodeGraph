class AudioSonifier {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume: number = 0.3; // Default 30% volume
  private enabled: boolean = false; // Muted by default to avoid annoying user

  // Weather Ambient Synth Properties
  private ambientGain: GainNode | null = null;
  private weatherDroneOsc: OscillatorNode | null = null;
  private weatherDroneGain: GainNode | null = null;
  private rainNoiseSource: AudioBufferSourceNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private windNoiseSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;
  private windLfo: OscillatorNode | null = null;
  private windLfoGain: GainNode | null = null;
  private magmaOsc: OscillatorNode | null = null;
  private magmaFilter: BiquadFilterNode | null = null;
  private magmaGain: GainNode | null = null;
  private magmaLfo: OscillatorNode | null = null;
  private magmaLfoGain: GainNode | null = null;


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

  public startAmbientWeather() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.ambientGain) return; // Already running

    try {
      const t = this.ctx.currentTime;
      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.3, t);
      this.ambientGain.connect(this.masterGain);

      // Create white noise buffer
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      // 1. Setup Rain Synth (Pink/Bandpassed Noise)
      this.rainNoiseSource = this.ctx.createBufferSource();
      this.rainNoiseSource.buffer = noiseBuffer;
      this.rainNoiseSource.loop = true;

      this.rainFilter = this.ctx.createBiquadFilter();
      this.rainFilter.type = 'bandpass';
      this.rainFilter.frequency.setValueAtTime(1500, t);
      this.rainFilter.Q.setValueAtTime(1.5, t);

      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.setValueAtTime(0, t);

      this.rainNoiseSource.connect(this.rainFilter);
      this.rainFilter.connect(this.rainGain);
      this.rainGain.connect(this.ambientGain);
      this.rainNoiseSource.start(t);

      // 2. Setup Wind Synth (Howling Bandpassed Noise with LFO modulation)
      this.windNoiseSource = this.ctx.createBufferSource();
      this.windNoiseSource.buffer = noiseBuffer;
      this.windNoiseSource.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.setValueAtTime(450, t);
      this.windFilter.Q.setValueAtTime(8, t);

      this.windGain = this.ctx.createGain();
      this.windGain.gain.setValueAtTime(0, t);

      this.windLfo = this.ctx.createOscillator();
      this.windLfo.frequency.setValueAtTime(0.08, t); // Very slow swell

      this.windLfoGain = this.ctx.createGain();
      this.windLfoGain.gain.setValueAtTime(250, t); // Sweep range +/- 250Hz

      this.windLfo.connect(this.windLfoGain);
      this.windLfoGain.connect(this.windFilter.frequency);

      this.windNoiseSource.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.ambientGain);

      this.windLfo.start(t);
      this.windNoiseSource.start(t);

      // 3. Setup Clear Sky Drone (Low Neon drone)
      this.weatherDroneOsc = this.ctx.createOscillator();
      this.weatherDroneOsc.type = 'sine';
      this.weatherDroneOsc.frequency.setValueAtTime(82.4, t); // E2 note

      this.weatherDroneGain = this.ctx.createGain();
      this.weatherDroneGain.gain.setValueAtTime(0.08, t);

      this.weatherDroneOsc.connect(this.weatherDroneGain);
      this.weatherDroneGain.connect(this.ambientGain);
      this.weatherDroneOsc.start(t);

      // 4. Setup Magma Bass (Sawtooth + Lowpass LFO modulation)
      this.magmaOsc = this.ctx.createOscillator();
      this.magmaOsc.type = 'sawtooth';
      this.magmaOsc.frequency.setValueAtTime(55, t); // A1 note

      this.magmaFilter = this.ctx.createBiquadFilter();
      this.magmaFilter.type = 'lowpass';
      this.magmaFilter.frequency.setValueAtTime(100, t);
      this.magmaFilter.Q.setValueAtTime(4, t);

      this.magmaGain = this.ctx.createGain();
      this.magmaGain.gain.setValueAtTime(0, t);

      this.magmaLfo = this.ctx.createOscillator();
      this.magmaLfo.frequency.setValueAtTime(0.25, t); // 4 seconds per bubble cycle

      this.magmaLfoGain = this.ctx.createGain();
      this.magmaLfoGain.gain.setValueAtTime(35, t); // Sweep up/down 35Hz

      this.magmaLfo.connect(this.magmaLfoGain);
      this.magmaLfoGain.connect(this.magmaFilter.frequency);

      this.magmaOsc.connect(this.magmaFilter);
      this.magmaFilter.connect(this.magmaGain);
      this.magmaGain.connect(this.ambientGain);

      this.magmaLfo.start(t);
      this.magmaOsc.start(t);
    } catch (e) {
      console.error('Failed to start ambient weather synthesizer:', e);
    }
  }

  public stopAmbientWeather() {
    try {
      const stopNode = (node: any) => {
        if (!node) return;
        try {
          node.stop();
        } catch (e) {}
        try {
          node.disconnect();
        } catch (e) {}
      };

      const disconnectNode = (node: any) => {
        if (!node) return;
        try {
          node.disconnect();
        } catch (e) {}
      };

      stopNode(this.weatherDroneOsc);
      stopNode(this.rainNoiseSource);
      stopNode(this.windNoiseSource);
      stopNode(this.windLfo);
      stopNode(this.magmaOsc);
      stopNode(this.magmaLfo);

      disconnectNode(this.weatherDroneGain);
      disconnectNode(this.rainFilter);
      disconnectNode(this.rainGain);
      disconnectNode(this.windFilter);
      disconnectNode(this.windGain);
      disconnectNode(this.windLfoGain);
      disconnectNode(this.magmaFilter);
      disconnectNode(this.magmaGain);
      disconnectNode(this.magmaLfoGain);
      disconnectNode(this.ambientGain);

      this.weatherDroneOsc = null;
      this.weatherDroneGain = null;
      this.rainNoiseSource = null;
      this.rainFilter = null;
      this.rainGain = null;
      this.windNoiseSource = null;
      this.windFilter = null;
      this.windGain = null;
      this.windLfo = null;
      this.windLfoGain = null;
      this.magmaOsc = null;
      this.magmaFilter = null;
      this.magmaGain = null;
      this.magmaLfo = null;
      this.magmaLfoGain = null;
      this.ambientGain = null;
    } catch (e) {
      console.error('Failed to stop ambient weather synthesizer:', e);
    }
  }

  public updateAmbientWeather(cveCount: number, cycleCount: number, hotspotCount: number) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    if (!this.ambientGain) {
      this.startAmbientWeather();
    }

    const t = this.ctx.currentTime;
    const transitionTime = 1.5; // Smooth fade transition in seconds

    // 1. Drone (Clear Sky)
    // Reduce hum drone if there is a storm/rain to make space
    const totalDisturbance = cveCount + cycleCount + hotspotCount;
    const targetDroneVolume = totalDisturbance === 0 ? 0.08 : Math.max(0.01, 0.08 - totalDisturbance * 0.015);
    if (this.weatherDroneGain) {
      this.weatherDroneGain.gain.setTargetAtTime(targetDroneVolume, t, transitionTime);
    }

    // 2. Rain volume based on circular dependencies
    const targetRainVolume = cycleCount > 0 ? Math.min(0.18, 0.04 + cycleCount * 0.02) : 0;
    if (this.rainGain) {
      this.rainGain.gain.setTargetAtTime(targetRainVolume, t, transitionTime);
    }

    // 3. Wind volume and LFO speed based on security vulnerabilities (Storm)
    const targetWindVolume = cveCount > 0 ? Math.min(0.22, 0.06 + cveCount * 0.035) : 0;
    if (this.windGain) {
      this.windGain.gain.setTargetAtTime(targetWindVolume, t, transitionTime);
    }
    if (this.windLfo && cveCount > 0) {
      // Increase wind modulation rate for heavy storms
      this.windLfo.frequency.setTargetAtTime(0.08 + cveCount * 0.04, t, transitionTime);
    }

    // 4. Magma volume based on architectural hotspots
    const targetMagmaVolume = hotspotCount > 0 ? Math.min(0.15, 0.03 + hotspotCount * 0.025) : 0;
    if (this.magmaGain) {
      this.magmaGain.gain.setTargetAtTime(targetMagmaVolume, t, transitionTime);
    }
  }

  public playLightningStrike() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx || !this.masterGain) return;
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});

    try {
      const t = this.ctx.currentTime;
      const bufferSize = this.ctx.sampleRate * 0.4; // 400ms crackle
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);

      // Simulate a harsh crackling electric bolt
      for (let i = 0; i < bufferSize; i++) {
        const envelope = Math.pow(1 - i / bufferSize, 3.5);
        const crackle = Math.random() > 0.96 ? (Math.random() * 2 - 1) : (Math.random() * 0.15 - 0.075);
        output[i] = crackle * envelope;
      }

      const noiseNode = this.ctx.createBufferSource();
      noiseNode.buffer = noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1000, t);
      filter.Q.setValueAtTime(0.9, t);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      // Low frequency thunder rumbling support
      const thunderOsc = this.ctx.createOscillator();
      thunderOsc.type = 'sawtooth';
      thunderOsc.frequency.setValueAtTime(80, t);
      thunderOsc.frequency.exponentialRampToValueAtTime(25, t + 0.35);

      const thunderFilter = this.ctx.createBiquadFilter();
      thunderFilter.type = 'lowpass';
      thunderFilter.frequency.setValueAtTime(75, t);

      const thunderGain = this.ctx.createGain();
      thunderGain.gain.setValueAtTime(0.28, t);
      thunderGain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

      noiseNode.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      thunderOsc.connect(thunderFilter);
      thunderFilter.connect(thunderGain);
      thunderGain.connect(this.masterGain);

      noiseNode.start(t);
      thunderOsc.start(t);
      noiseNode.stop(t + 0.4);
      thunderOsc.stop(t + 0.4);

      setTimeout(() => {
        noiseNode.disconnect();
        filter.disconnect();
        gain.disconnect();
        thunderOsc.disconnect();
        thunderFilter.disconnect();
        thunderGain.disconnect();
      }, 500);
    } catch (e) {
      console.error('Failed to play lightning strike sound:', e);
    }
  }
}


export const audioSonifier = new AudioSonifier();

