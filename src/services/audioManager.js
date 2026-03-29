import sound from 'pixi-sound';

class AudioManager {
  constructor() {
    this.currentMusic = null;
    this.soundsLoaded = false;
    this.musicVolume = 0.5;
    this.sfxVolume = 0.5;
  }

  async init() {
    if (this.soundsLoaded) return;

    // Enregistre tous les sons en parallele pour reduire le temps de chargement.
    await Promise.all([
      sound.add('MenuMusic', 'assets/sounds/musics/MenuMusic.mp3'),
      sound.add('CharacterSelectionMusic', 'assets/sounds/musics/CharacterSelectionMusic.mp3'),
      sound.add('GameMusic', 'assets/sounds/musics/GameMusic.mp3'),
      sound.add('Explosion_1', 'assets/sounds/soundEffects/Explosion_1.mp3'),
      sound.add('Explosion_2', 'assets/sounds/soundEffects/Explosion_2.mp3'),
      sound.add('Explosion_3', 'assets/sounds/soundEffects/Explosion_3.mp3'),
      sound.add('Sniper', 'assets/sounds/soundEffects/Sniper.mp3'),
      sound.add('Airstrike', 'assets/sounds/soundEffects/Airstrike.mp3'),
      sound.add('GunFiring', 'assets/sounds/soundEffects/GunFiring.mp3'),
      sound.add('LittleGunFiring', 'assets/sounds/soundEffects/LittleGunFiring.mp3'),
    ]);

    this.soundsLoaded = true;
  }

  playMusic(musicName, loop = true) {
    // Arrêter la musique actuelle
    if (this.currentMusic && sound.exists(this.currentMusic)) {
      sound.stop(this.currentMusic);
    }

    if (sound.exists(musicName)) {
      sound.play(musicName, {
        loop,
        volume: this.musicVolume,
      });
      this.currentMusic = musicName;
    }
  }

  stopMusic() {
    if (this.currentMusic && sound.exists(this.currentMusic)) {
      sound.stop(this.currentMusic);
      this.currentMusic = null;
    }
  }

  playExplosion() {
    const explosions = ['Explosion_1', 'Explosion_2', 'Explosion_3'];
    const randomExplosion = explosions[Math.floor(Math.random() * explosions.length)];
    this.playSFX(randomExplosion);
  }

  playSniper() {
    this.playSFX('Sniper');
  }

  playGunFiring() {
    this.playSFX('GunFiring');
  }

  playLittleGunFiring() {
    this.playSFX('LittleGunFiring');
  }

  playSFX(soundName) {
    if (sound.exists(soundName)) {
      sound.play(soundName, {
        volume: this.sfxVolume,
      });
    }
  }

  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.currentMusic && sound.exists(this.currentMusic)) {
      sound.volume(this.currentMusic, this.musicVolume);
    }
  }

  setSFXVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  setMasterVolume(volume) {
    const clamped = Math.max(0, Math.min(1, volume));
    this.setMusicVolume(clamped);
    this.setSFXVolume(clamped);
  }

  getMasterVolume() {
    return Math.round(this.musicVolume * 100);
  }

  mute() {
    sound.muteAll();
  }

  unmute() {
    sound.unmuteAll();
  }
}

export const audioManager = new AudioManager();
