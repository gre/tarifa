var path = require('path');

module.exports.root = path.resolve(__dirname, 'template');
module.exports.pluginXMLPath = path.resolve(__dirname, 'template/plugin.xml');
module.exports.files = [
    'src/ios/$NAME.h',
    'src/ios/$NAME.m'
];
