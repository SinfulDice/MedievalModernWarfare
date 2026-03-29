import { MenuScene } from '../scenes/MenuScene.js';
import { CharacterSelectionScene } from '../scenes/CharacterSelectionScene.js';
import { GameScene } from '../scenes/GameScene.js';
import { LeaderboardScene } from '../scenes/LeaderboardScene.js';
import { CreditsScene } from '../scenes/CreditsScene.js';

export class SceneManager {
    constructor(app) {
        this.app = app;
        this.scenes = {
            menu: MenuScene,
            charSelect: CharacterSelectionScene,
            game: GameScene,
            leaderboard: LeaderboardScene,
            credits: CreditsScene
        };
        this.currentScene = null;
    }

    async changeScene(sceneKey, options = {}) {
        if (this.currentScene) {
            if (this.currentScene.container) {
                this.app.stage.removeChild(this.currentScene.container);
            }
            if (typeof this.currentScene.destroy === 'function') {
                this.currentScene.destroy();
            }
        }

        const SceneClass = this.scenes[sceneKey];
        
        if (!SceneClass) {
            console.error(`La scène "${sceneKey}" n'existe pas dans SceneManager.`);
            return;
        }

        this.currentScene = new SceneClass(this.app, this);
        await this.currentScene.init(options);
        if (this.currentScene.container) {
            this.app.stage.addChild(this.currentScene.container);
        }
    }
}