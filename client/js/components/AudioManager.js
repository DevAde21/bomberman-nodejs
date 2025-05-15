// client/js/components/AudioManager.js

const SOUND_FILES = {
    create_bomb: 'assets/sounds/create_bomb.mp3',
    bomb_explosion: 'assets/sounds/bomb_explosion.mp3',
    powerup: 'assets/sounds/powerup.mp3',
    death: 'assets/sounds/death.mp3',
    deathmatch_wall: 'assets/sounds/deathmatch_wall.mp3',
    game_over: 'assets/sounds/game_over.mp3',
};

export class AudioManager {
    constructor() {
        this.sounds = {};
        this.globalVolume = 1.0;
        this.isMuted = false;
        this.userInteracted = false; // Flag para interação do usuário

        // Adiciona listener para a primeira interação do usuário
        const interactionEvents = ['click', 'keydown', 'touchstart'];
        const firstInteractionListener = () => {
            this.userInteracted = true;
            console.log("User has interacted with the page. Audio context should be unlocked.");
            // Tenta tocar sons que podem ter falhado em carregar/tocar antes
            // (Opcional, pode ser complexo gerenciar uma fila de sons pendentes)
            interactionEvents.forEach(event => document.removeEventListener(event, firstInteractionListener, true));
        };

        interactionEvents.forEach(event => document.addEventListener(event, firstInteractionListener, { capture: true, once: true }));

        for (const key in SOUND_FILES) {
            this.sounds[key] = new Audio();
            this.sounds[key].src = SOUND_FILES[key];
            // Opcional: Forçar o carregamento inicial.
            // this.sounds[key].load(); // Alguns navegadores podem ignorar isso até a interação.
        }
        console.log("AudioManager initialized. Sound sources set.");
    }

    playSound(soundName, { volume = 1.0 } = {}) {
        if (this.isMuted) return;

        // Política de autoplay dos navegadores exige interação do usuário primeiro.
        // Se o usuário não interagiu, é provável que play() falhe silenciosamente ou com aviso.
        if (!this.userInteracted) {
            // console.warn(`AudioManager: Attempted to play sound '${soundName}' before user interaction. Playback might be blocked.`);
            // Não impede a tentativa, mas pode não funcionar.
        }

        const sound = this.sounds[soundName];
        if (sound) {
            // Interrompe o som atual (se for o mesmo e estiver tocando) e reinicia
            if (!sound.paused) {
                sound.pause();
            }
            sound.currentTime = 0; // Sempre reinicia para a regra "interrompa o que está tocando para tocar"
            
            sound.volume = this.globalVolume * volume;

            const playPromise = sound.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    if (error.name === 'NotAllowedError') {
                        console.warn(`AudioManager: Playback of '${soundName}' was prevented. User likely needs to interact with the page first.`);
                    } else {
                        console.warn(`AudioManager: Error playing sound '${soundName}':`, error.message);
                    }
                });
            }
        } else {
            console.warn(`AudioManager: Sound not found: ${soundName}`);
        }
    }

    setGlobalVolume(volume) {
        this.globalVolume = Math.max(0, Math.min(1, volume));
        // Para simplificar, não atualiza o volume dos sons já tocando.
        // Poderia ser adicionado se necessário.
        console.log(`Global volume set to ${this.globalVolume}`);
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.isMuted) {
            for (const key in this.sounds) {
                if (this.sounds[key] && !this.sounds[key].paused) {
                    this.sounds[key].pause();
                    // Não resetamos currentTime aqui, para que possa ser resumido se o mudo for desfeito.
                    // Mas a regra "interrompa o que está tocando para tocar" já reinicia no playSound.
                }
            }
        }
        console.log(this.isMuted ? "AudioManager: Sounds Muted" : "AudioManager: Sounds Unmuted");
        return this.isMuted;
    }

    // Método para chamar após a interação inicial, se necessário
    unlockAudioContext() {
        if (!this.userInteracted) {
            this.userInteracted = true;
            console.log("Audio context manually marked as unlocked.");
        }
        // Se você tiver um AudioContext explícito, aqui seria o lugar para chamar `audioContext.resume()`
    }
}