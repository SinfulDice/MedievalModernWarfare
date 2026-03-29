import { Application } from 'pixi.js';
import { SceneManager } from './scenes/sceneManager.js';

const app = new Application();

async function init() {
    await app.init({ 
        background: '#87CEEB', 
        resizeTo: window,
        antialias: true 
    });
    
    app.stage.sortableChildren = true;
    document.body.appendChild(app.canvas);

    const sceneManager = new SceneManager(app);
    
    await sceneManager.changeScene('menu');
}

init();