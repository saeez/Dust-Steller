const width = 1000;
const height = 1000;
const tempTargetsLength = 30000;
const particleCount = 2500;
let density = 2;

if (tempTargetsLength * density > particleCount * 0.8) {
    density = (particleCount * 0.8) / tempTargetsLength;
}

const textParticleCount = Math.floor(tempTargetsLength * density);
console.log("density:", density);
console.log("textParticleCount:", textParticleCount);

let minTarget = tempTargetsLength, maxTarget = 0;
for (let i = 0; i < 10000; i++) {
    if (i < textParticleCount) {
        const targetIndex = Math.floor(i / density) % tempTargetsLength;
        if (targetIndex < minTarget) minTarget = targetIndex;
        if (targetIndex > maxTarget) maxTarget = targetIndex;
    }
}
console.log("minTarget:", minTarget);
console.log("maxTarget:", maxTarget);
