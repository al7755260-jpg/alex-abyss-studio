import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error('Usage: node scripts/inspect-cabinet-animation.mjs <cabinet.glb>');
}

await MeshoptDecoder.ready;
const document = await new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  .read(inputPath);
const root = document.getRoot();
const animations = root.listAnimations().map((animation) => ({
  name: animation.getName(),
  channels: animation.listChannels().map((channel) => {
    const sampler = channel.getSampler();
    const input = Array.from(sampler.getInput()?.getArray() ?? []);
    const output = Array.from(sampler.getOutput()?.getArray() ?? []);
    return {
      node: channel.getTargetNode()?.getName(),
      path: channel.getTargetPath(),
      interpolation: sampler.getInterpolation(),
      input,
      output,
    };
  }),
}));

console.log(JSON.stringify({
  scenes: root.listScenes().map((scene) => scene.getName()),
  hinges: root.listNodes()
    .filter((node) => node.getName().includes('Hinge'))
    .map((node) => ({
      name: node.getName(),
      translation: node.getTranslation(),
      rotation: node.getRotation(),
      scale: node.getScale(),
    })),
  animations,
}, null, 2));
