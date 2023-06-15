module.exports = {
  packagerConfig: {
    osxSign: {
      optionsForFile: (filePath) => {
        return {
          entitlements: 'build/entitlements.mac.plist'
        }
      }
    },
    osxNotarize: {
      tool: 'notarytool',
      keychainProfile: 'OpenLive3D',
    },
    icon: './build/icon'
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {},
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
};
