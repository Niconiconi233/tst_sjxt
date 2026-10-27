/**
 * 生成一个「审计通知书」测试模板（含占位符、表格、页眉），
 * 供 docx 占位符链路验证使用。产物放在 public/ 下由 dev server 提供。
 *
 *   node scripts/make-test-template.cjs
 */
const fs = require('fs');
const path = require('path');
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  Header,
  BorderStyle,
} = require('docx');

const FONT = '仿宋';

const p = (text, opts = {}) =>
  new Paragraph({
    alignment: opts.align,
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        font: { name: FONT, eastAsia: FONT },
        size: opts.size ?? 32, // 16pt
        bold: opts.bold,
      }),
    ],
  });

const cell = (text, opts = {}) =>
  new TableCell({
    width: { size: opts.width ?? 3000, type: WidthType.DXA },
    children: [
      new Paragraph({
        alignment: opts.align ?? AlignmentType.CENTER,
        children: [new TextRun({ text, font: { name: FONT, eastAsia: FONT }, size: 28 })],
      }),
    ],
  });

const doc = new Document({
  sections: [
    {
      properties: {
        page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: '${机关名称}　${文号}',
                  font: { name: FONT, eastAsia: FONT },
                  size: 24,
                }),
              ],
            }),
          ],
        }),
      },
      children: [
        p('关于对${被审计单位}${审计期间}审计的通知', {
          align: AlignmentType.CENTER,
          size: 44,
          bold: true,
        }),
        p('${文号}', { align: AlignmentType.CENTER, size: 28 }),
        p('${被审计单位}：'),
        p(
          '根据《中华人民共和国审计法》的有关规定，经${机关名称}研究决定，派出审计组对你单位${审计期间}的${审计类型}情况进行审计。现将有关事项通知如下：',
        ),
        p('一、审计范围与内容'),
        p('${审计事项}。必要时将追溯以前年度或延伸审计有关单位。'),
        p('二、审计组组成'),
        new Table({
          width: { size: 9000, type: WidthType.DXA },
          rows: [
            new TableRow({
              children: [
                cell('审计组职务', { width: 2600 }),
                cell('姓　名', { width: 2000 }),
                cell('工作驻地', { width: 4400 }),
              ],
            }),
            new TableRow({
              children: [
                cell('审计组组长', { width: 2600 }),
                cell('${审计组组长}', { width: 2000 }),
                cell('${工作驻地}', { width: 4400 }),
              ],
            }),
            new TableRow({
              children: [
                cell('主　审', { width: 2600 }),
                cell('${主审}', { width: 2000 }),
                cell('${审计组成员}', { width: 4400 }),
              ],
            }),
          ],
        }),
        p(''),
        p('三、现场审计时间'),
        p('自${现场审计起}起至${现场审计止}止。'),
        p('四、有关要求'),
        p('请予配合，并提供必要的工作条件。联系人：${联系人}。'),
        p(''),
        p('${机关名称}', { align: AlignmentType.RIGHT }),
        p('${发文日期}', { align: AlignmentType.RIGHT }),
      ],
    },
  ],
});

const out = path.join(__dirname, '..', 'public', '__tpl_notice_test.docx');
fs.mkdirSync(path.dirname(out), { recursive: true });
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log('已生成', out, buf.length, 'bytes');
});
