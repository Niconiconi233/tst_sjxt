/**
 * eastAsia 槽位修复的回归测试
 *
 * 场景：docx-editor UI 字体命令只写 ascii/hAnsi 不写 eastAsia。
 * 验证 fixXml 对各类 rFonts 形态的修复是否正确。
 *
 * 运行：node scripts/test-eastasia-fix.mjs
 * 前置：先 esbuild 打包 src/utils/docxEastAsiaFix.ts
 */
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';

// 打包（jszip external，浏览器模块在 node 下直接用）
execSync(
  './node_modules/.bin/esbuild src/utils/docxEastAsiaFix.ts --bundle --platform=node ' +
  '--format=cjs --external:jszip --outfile=/tmp/ea-fix.cjs',
  { cwd: process.cwd(), stdio: 'inherit' },
);
const { fixXml, isCjkFamily } = await import('/tmp/ea-fix.cjs');
// NODE_PATH 方式解析 jszip（脚本输出在 /tmp，用绝对路径兜底）
if (!fixXml) throw new Error('打包产物异常');

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n    期望: ${expected}\n    实际: ${actual}`); }
}

console.log('=== 1. isCjkFamily ===');
check('中文名', isCjkFamily('楷体'), true);
check('英文名', isCjkFamily('KaiTi'), true);
check('GB2312 别名', isCjkFamily('仿宋_GB2312'), true);
check('西文不误伤', isCjkFamily('Times New Roman'), false);
check('空值', isCjkFamily(null), false);
check('大小写折叠', isCjkFamily('SIMSUN'), true);

console.log('\n=== 2. fixXml 场景 ===');

// 场景 A：引擎缺陷形态——ascii/hAnsi=KaiTi，eastAsia=仿宋_GB2312 → 应修复 eastAsia
const A = '<w:rFonts w:ascii="KaiTi" w:eastAsia="仿宋_GB2312" w:hAnsi="KaiTi"/>';
check('A: ascii=楷体时 eastAsia 同步',
  fixXml(A),
  '<w:rFonts w:ascii="KaiTi" w:eastAsia="KaiTi" w:hAnsi="KaiTi" w:cs="KaiTi"/>');

// 场景 B：公文正常形态——西文 Times + 中文宋体 → 不动
const B = '<w:rFonts w:ascii="Times New Roman" w:eastAsia="仿宋_GB2312" w:hAnsi="Times New Roman"/>';
check('B: 西文字体不动 eastAsia', fixXml(B), B);

// 场景 C：无 eastAsia 属性（引擎新写的 run）→ 补上
const C = '<w:rFonts w:ascii="KaiTi" w:hAnsi="KaiTi"/>';
check('C: 缺 eastAsia 时补写',
  fixXml(C),
  '<w:rFonts w:ascii="KaiTi" w:hAnsi="KaiTi" w:eastAsia="KaiTi" w:cs="KaiTi"/>');

// 场景 D：已是楷体但缺 cs → 补齐 cs（引擎 2.33 只补 eastAsia）
const D = '<w:rFonts w:ascii="楷体" w:eastAsia="楷体" w:hAnsi="楷体"/>';
check('D: 缺 cs 时补齐',
  fixXml(D),
  '<w:rFonts w:ascii="楷体" w:eastAsia="楷体" w:hAnsi="楷体" w:cs="楷体"/>');

// 场景 D2：四个槽位都一致 → 幂等不重复改
const D2 = '<w:rFonts w:ascii="楷体" w:cs="楷体" w:eastAsia="楷体" w:hAnsi="楷体"/>';
check('D2: 四槽位一致则不改', fixXml(D2), D2);

// 场景 E：段落标记 rPr（无 sz）同样处理
const E = '<w:rPr><w:rFonts w:ascii="SimHei" w:hAnsi="SimHei"/></w:rPr>';
check('E: 段落标记 rPr 处理',
  fixXml(E),
  '<w:rPr><w:rFonts w:ascii="SimHei" w:hAnsi="SimHei" w:eastAsia="SimHei" w:cs="SimHei"/></w:rPr>');

// 场景 F：中文名 ascii（用户选了「楷体」中文名）
const F = '<w:rFonts w:ascii="楷体" w:hAnsi="楷体"/>';
check('F: 中文名 ascii 触发',
  fixXml(F),
  '<w:rFonts w:ascii="楷体" w:hAnsi="楷体" w:eastAsia="楷体" w:cs="楷体"/>');

// 场景 G：属性顺序无关（hAnsi 在前）
const G = '<w:rFonts w:hAnsi="FangSong" w:eastAsia="宋体" w:ascii="FangSong"/>';
check('G: hAnsi 是中文字体也触发',
  fixXml(G),
  '<w:rFonts w:hAnsi="FangSong" w:eastAsia="FangSong" w:ascii="FangSong" w:cs="FangSong"/>');

// 场景 H：多个 rFonts 混合
const H = '<w:rPr><w:rFonts w:ascii="KaiTi" w:eastAsia="仿宋_GB2312" w:hAnsi="KaiTi"/><w:sz w:val="32"/></w:rPr>';
check('H: 多元素只改目标',
  fixXml(H),
  '<w:rPr><w:rFonts w:ascii="KaiTi" w:eastAsia="KaiTi" w:hAnsi="KaiTi" w:cs="KaiTi"/><w:sz w:val="32"/></w:rPr>');

// 场景 I：cs 原有值被覆盖（保持一致）
const I = '<w:rFonts w:ascii="SimHei" w:cs="Arial" w:hAnsi="SimHei"/>';
check('I: cs 一并同步',
  fixXml(I),
  '<w:rFonts w:ascii="SimHei" w:cs="SimHei" w:hAnsi="SimHei" w:eastAsia="SimHei"/>');

// 场景 J：微软雅黑也纳入
const J = '<w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei"/>';
check('J: 微软雅黑触发',
  fixXml(J),
  '<w:rFonts w:ascii="Microsoft YaHei" w:hAnsi="Microsoft YaHei" w:eastAsia="Microsoft YaHei" w:cs="Microsoft YaHei"/>');

// 场景 K：非自闭合 rFonts（不应出现，但保证不崩）
const K = '<w:rFonts w:ascii="KaiTi"></w:rFonts>';
check('K: 非自闭合不处理（原样返回）', fixXml(K), K);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
