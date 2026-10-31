# Grammar point sources

Raw copies, unedited, for reference while building moink's grammar list.
Nothing in the app reads these yet.

## krmanik-2025/

HSK 3.0 grammar from the 2025-11 syllabus (新版HSK考试大纲（词汇、汉字、语法）),
levels 1 to 6 and 7-9, as JSON. Fields: 类别, 类别名称, 细目, 语法内容. No
examples. 593 entries.

- Repo: https://github.com/krmanik/HSK-3.0
- Path: `New HSK (2025)/HSK Grammar/json/HSK {1..6,7-9}.json`
- Commit: 182692ce5a11bc30bdc771835d2f0f27491c25de (2026-06-14, "Number
  grammar lists and fix page-break-split categories"), the last commit
  touching the folder; repo HEAD was d30e97016a7f52af6437805170759031d93bbe6a
  when fetched (2026-10-31).
- Upstream document: https://hsk.cn-bj.ufileos.com/3.0/新版HSK考试大纲（词汇、汉字、语法）.pdf
- License: none stated for the grammar files (see LICENSE-krmanik.md, which
  lists sources and covers only the word lists, as CC BY-SA 4.0).

## krmanik-2021/

HSK 3.0 grammar from the 2021 standard (GF 0025-2021, 国际中文教育中文水平等级标准,
appendix A), OCR'd to text, with the standard's codes (【一01】) and example
sentences. 572 points.

- Repo: https://github.com/krmanik/HSK-3.0
- Path: `New HSK (2021)/HSK Grammar/HSK {1..6,7-9}.txt`
- Commit: 36ace0c51449d091ae9d7fbf04ce31617a4e1aff (2025-12-19, "dir
  restructure"), the last commit touching the folder.
- Upstream document: http://www.moe.gov.cn/jyb_xwfb/gzdt_gzdt/s5987/202103/W020210329527301787356.pdf
- License: none stated for the grammar files (as above).
- OCR quirks: 【四29］ and 【六47］ close with ］; levels 7-9 mix 七—九 and
  七-九 in codes.

## ivankra-2021/

The same 2021 standard as one CSV. Columns: No, Level, Group, Category,
Details, Content. No examples. 573 rows.

- Repo: https://github.com/ivankra/hsk30
- Path: `hsk30-grammar.csv`
- Commit: 4ff9e3915ce87baaecd7ebe263085573a4ea3192 (2023-11-08, "Initial
  commit")
- License: MIT (LICENSE in this folder). The README adds that the data copies
  a PRC Ministry of Education document whose own copyright status is unclear.
