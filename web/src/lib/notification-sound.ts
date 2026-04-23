let audioCtx: AudioContext | null = null

/**
 * Play a short retro beep using Web Audio API.
 * Square wave at 800Hz for 150ms — fits the pixel-art aesthetic.
 */
export function playNotificationSound() {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext()
    }
    // Resume if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume()
    }

    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()

    osc.type = 'square'
    osc.frequency.value = 800
    gain.gain.value = 0.15

    osc.connect(gain)
    gain.connect(audioCtx.destination)

    const now = audioCtx.currentTime
    osc.start(now)
    osc.stop(now + 0.15)
  } catch {
    // Silently ignore — audio is optional
  }
}
