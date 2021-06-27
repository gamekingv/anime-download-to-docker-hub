const fs = require('fs').promises;
const child_process = require('child_process');
const { promisify } = require('util');
const exec = promisify(child_process.exec);

async function mapDirectory(root) {
  try {
    await fs.stat(root);
  }
  catch (e) { return; }
  const filesArr = [];
  root += '/';
  await (async function dir(dirpath) {
    const files = await fs.readdir(dirpath);
    for (const file of files) {
      const info = await fs.stat(dirpath + file);
      if (info.isDirectory()) {
        await dir(dirpath + file + '/');
      } else {
        filesArr.push(dirpath + file);
      }
    }
  })(root);
  return filesArr;
}

(async () => {
  try {
    const files = await mapDirectory('Offline');
    if (!files) return console.log('无文件需要抽取字幕');
    const mkvs = files.filter((item) => /\.mkv$/.test(item));
    for (const mkv of mkvs) {
      const { stdout: output, stderr } = await exec(`mkvinfo "${mkv}"`);
      if (stderr) throw stderr;
      if (output) {
        const matchReg = /(ch(i|s|t)|tc|sc|简|繁|中)/i;
        const filename = mkv.replace(/\.mkv$/, '');
        const tracks = [];
        const subtitles = [];
        const lines = output.split(/\r?\n/);
        lines.pop();
        lines.splice(0, lines.findIndex(item => item.includes('|+ Tracks')) + 1);
        for (const line of lines) {
          if (line.indexOf('|+') > -1) break;
          const result = line.match(/( {1,})\+ ([^:]*)(: (.*))?/);
          if (result[1].length === 1) tracks.push({});
          else if (result[1].length === 2) tracks[tracks.length - 1][result[2]] = result[4];
        }
        for (i in tracks) {
          if (tracks[i]['Track type'] === 'subtitles') {
            if (tracks[i]['Name'] && tracks[i]['Name'].match(matchReg)) {
              subtitles.push({ trackId: i, name: tracks[i]['Name'], ext: tracks[i]['Codec ID'].replace('S_TEXT/', '').toLowerCase().replace('utf8', 'srt') });
              continue;
            }
            if (tracks[i]['Title'] && tracks[i]['Title'].match(matchReg)) {
              subtitles.push({ trackId: i, name: tracks[i]['Title'], ext: tracks[i]['Codec ID'].replace('S_TEXT/', '').toLowerCase().replace('utf8', 'srt') });
              continue;
            }
            if (tracks[i]['Language'] && tracks[i]['Language'].match(/(Chinese|chi|zho)/i)) {
              subtitles.push({ trackId: i, name: tracks[i]['Language'], ext: tracks[i]['Codec ID'].replace('S_TEXT/', '').toLowerCase().replace('utf8', 'srt') });
              break;
            }
          }
        }
        if (subtitles.length === 0) return `${mkv}无字幕需要抽取`;
        let extract = `mkvextract tracks "${mkv}"`;
        for (const subtitle of subtitles) {
          extract += ` ${subtitle.trackId}:"${filename}.${subtitle.name}.${subtitle.ext}"`;
        }
        await exec(extract);
      }
      else '命令无输出';
    }
  }
  catch (error) {
    console.log(error);
    process.exit(1);
  }
})();
