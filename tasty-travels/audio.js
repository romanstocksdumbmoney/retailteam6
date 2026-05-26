(function () {
  "use strict";

  class TastyAudioController {
    constructor() {
      this.context = null;
      this.isMuted = false;
      this.unlockBound = this.unlock.bind(this);
      window.addEventListener("pointerdown", this.unlockBound, { once: true });
      window.addEventListener("keydown", this.unlockBound, { once: true });
    }

    unlock() {
      this.ensureContext();
      if (!this.context) {
        return;
      }
      if (this.context.state === "suspended") {
        this.context.resume();
      }
    }

    ensureContext() {
      if (this.context || this.isMuted) {
        return;
      }
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        return;
      }
      this.context = new AudioContextClass();
    }

    setMuted(muted) {
      this.isMuted = muted;
    }

    playTone({ frequency, type = "sine", duration = 0.12, volume = 0.08, glideTo = null }) {
      if (this.isMuted) {
        return;
      }
      this.ensureContext();
      if (!this.context) {
        return;
      }
      const now = this.context.currentTime;
      const gain = this.context.createGain();
      const osc = this.context.createOscillator();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      if (glideTo !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 12), now + duration);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0001), now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain);
      gain.connect(this.context.destination);
      osc.start(now);
      osc.stop(now + duration + 0.01);
    }

    playMerge(tier) {
      this.playTone({
        frequency: 320 + tier * 24,
        type: "triangle",
        duration: 0.16,
        volume: 0.1,
        glideTo: 520 + tier * 18,
      });
    }

    playSlideWhoosh(powerRatio) {
      const clampedPower = Math.max(0.1, Math.min(powerRatio, 1.2));
      this.playTone({
        frequency: 120,
        type: "sawtooth",
        duration: 0.09 + clampedPower * 0.06,
        volume: 0.04 + clampedPower * 0.03,
        glideTo: 60,
      });
    }

    playOrderComplete() {
      this.playTone({ frequency: 420, type: "triangle", duration: 0.12, volume: 0.08, glideTo: 560 });
      setTimeout(() => {
        this.playTone({ frequency: 660, type: "triangle", duration: 0.2, volume: 0.1, glideTo: 920 });
      }, 80);
    }
  }

  window.TastyAudio = {
    TastyAudioController,
  };
})();
