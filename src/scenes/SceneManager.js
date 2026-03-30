import { MenuScene } from '../scenes/MenuScene.js';
import { CharacterSelectionScene } from '../scenes/CharacterSelectionScene.js';
import { GameScene } from '../scenes/GameScene.js';
import { LeaderboardScene } from '../scenes/LeaderboardScene.js';
import { CreditsScene } from '../scenes/CreditsScene.js';

export class SceneManager {
    constructor(app) {
        this.app = app;
        this.currentSceneKey = null;
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
        // Si on revient au menu depuis une autre scene, on force un rechargement complet.
        if (sceneKey === 'menu' && this.currentSceneKey && this.currentSceneKey !== 'menu') {
            window.location.reload();
            return;
        }

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
        this.currentSceneKey = sceneKey;
        await this.currentScene.init(options);
        if (this.currentScene.container) {
            this.app.stage.addChild(this.currentScene.container);
        }
    }
}