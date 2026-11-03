/* Optional maintenance helper. The published website itself needs no build step. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const folder = path.join(root, 'cases');
// Use the site's scene order so D10 follows D9 and added scenes are checked.
const context = {window: {}, localStorage: {getItem() { return null; }}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/data.js'), 'utf8'), context);
const scenes = context.window.ATLAS.index.byStage.drilling.scenes;
const order = new Map(scenes.map((scene, index) => [scene.id, index]));
const packages = fs.readdirSync(folder).filter(name => fs.existsSync(path.join(folder, name, 'case.json'))).map(name => ({
  base: path.join(folder, name),
  pkg: JSON.parse(fs.readFileSync(path.join(folder, name, 'case.json'), 'utf8').replace(/^\uFEFF/, ''))
})).sort((a, b) => order.get(a.pkg.sceneId) - order.get(b.pkg.sceneId));
if (packages.length !== scenes.length || new Set(packages.map(p => p.pkg.id)).size !== packages.length ||
    new Set(packages.map(p => p.pkg.sceneId)).size !== scenes.length ||
    packages.some(p => !order.has(p.pkg.sceneId))) {
  throw new Error('每个钻井场景必须对应一个独立案例，案例 id 和 sceneId 不得重复');
}
for (const {base, pkg} of packages) {
  for (const file of ['README.txt', 'demo/index.html', 'demo/demo.css', 'demo/demo.js']) {
    if (!fs.existsSync(path.join(base, file))) throw new Error(pkg.id + ' 缺少文件：' + file);
  }
  for (const tab of ['background', 'workflow', 'demo']) {
    if (!pkg.tabs || !pkg.tabs[tab]) throw new Error(pkg.id + ' 缺少内容：' + tab);
  }
  if ((pkg.methods || []).some(method => !context.window.ATLAS.methods[method])) {
    throw new Error(pkg.id + ' 使用了不存在的方法类别');
  }
}
const records = packages.map(({base, pkg}) => {
  const files = [];
  function walk(current, prefix = '') {
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) walk(path.join(current, entry.name), name + '/');
      else if (name !== 'case.json' && name !== 'README.txt') {
        const bytes = fs.readFileSync(path.join(current, entry.name));
        const text = /\.(html?|css|m?js|json|svg|txt|csv|tsv|md|xml|ya?ml|geojson)$/i.test(name);
        const mime = text ? 'text/plain' : ({png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', woff2: 'font/woff2'}[path.extname(name).slice(1)] || 'application/octet-stream');
        files.push({name, size: bytes.length, mime, enc: text ? 'text' : 'dataurl', data: text ? bytes.toString('utf8') : `data:${mime};base64,${bytes.toString('base64')}`});
      }
    }
  }
  walk(base);
  return {v: 2, pkg, meta: {id: pkg.id, sceneId: pkg.sceneId, title: pkg.title, methods: pkg.methods || [], version: pkg.version, updated: pkg.updated}, files};
});
const content = '/* ' + records.length + ' 个随网站发布的钻井案例。自动生成，页面启动即注册，不写入浏览器存储。 */\n(function(global){\n"use strict";\nvar records=' + JSON.stringify(records).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + ';\nrecords.forEach(function(record){global.CaseImport.registerBundled(record)});\n})(window);\n';
fs.writeFileSync(path.join(root, 'assets/cases/drilling-packages.js'), content);
console.log('已更新 ' + records.length + ' 个内置案例，顺序：' + records.map(r => r.meta.sceneId).join(' → '));
console.log('重新上传整个网站即可发布更新。');
