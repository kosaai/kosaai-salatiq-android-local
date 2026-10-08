const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const source = path.join(__dirname, 'assets/launcher/source.png');
  if (fs.existsSync(source)) {
    const provenance = JSON.parse(fs.readFileSync(path.join(__dirname, 'assets/launcher/provenance.json'), 'utf8'));
    config.icon = './assets/launcher/icon.png';
    config.android = {
      ...config.android,
      icon: './assets/launcher/icon.png',
      adaptiveIcon: {
        foregroundImage: './assets/launcher/adaptive-foreground.png',
        backgroundColor: provenance.backgroundColor,
      },
    };
  }
  return config;
};
