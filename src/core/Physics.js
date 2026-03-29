import { Engine, Events, Composite } from 'matter-js';

export const engine = Engine.create();
export const world = engine.world;

engine.gravity.y = 1;
engine.positionIterations = 20;
engine.velocityIterations = 20;
engine.constraintIterations = 4;

const groundContacts = new Map();

function increment(id) {
    groundContacts.set(id, (groundContacts.get(id) || 0) + 1);
}
function decrement(id) {
    groundContacts.set(id, Math.max(0, (groundContacts.get(id) || 1) - 1));
}

Events.on(engine, 'collisionStart', (e) => {
    e.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        // On considère qu'un player touche le sol si l'autre body est statique
        if (bodyA.label === 'player' && bodyB.isStatic) increment(bodyA.id);
        if (bodyB.label === 'player' && bodyA.isStatic) increment(bodyB.id);
    });
});

Events.on(engine, 'collisionEnd', (e) => {
    e.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        if (bodyA.label === 'player' && bodyB.isStatic) decrement(bodyA.id);
        if (bodyB.label === 'player' && bodyA.isStatic) decrement(bodyB.id);
    });
});

export function isBodyGrounded(body) {
    return (groundContacts.get(body.id) || 0) > 0;
}

export function addBody(body) {
    Composite.add(world, body);
}

export function removeBody(body) {
    Composite.remove(world, body);
}
