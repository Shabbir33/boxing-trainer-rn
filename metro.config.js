// Learn more https://docs.expo.io/guides/customizing-metro
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @react-three/fiber/native does `require('three')`, which resolves to three's
// deprecated CJS shim. That shim calls `process.emitWarning`, which doesn't exist
// in React Native. Point every `three` import straight at the ES module build.
const threeModule = path.resolve(__dirname, 'node_modules/three/build/three.module.js');
const upstreamResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: threeModule };
  }
  return (upstreamResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
