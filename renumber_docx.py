# -*- coding: utf-8 -*-
"""对Word题库文档进行重新编号，并检测题干重复"""
import re
import copy
from docx import Document
from collections import Counter, defaultdict

DOC_PATH = r'积分系统题库（2022）2024.7.8.docx'
OUTPUT_PATH = r'积分系统题库（2022）2024.7.8_已重新编号.docx'

def main():
    doc = Document(DOC_PATH)
    paras = doc.paragraphs

    chapter_names = ['公共气象服务', '气象预警预报', '综合气象观测', '综合气象保障']

    # 定位题库
    sections = []
    for i, p in enumerate(paras):
        txt = p.text.strip()
        if txt == '应知应会业务库':
            sections.append(('应知应会业务库', i))
        elif txt == '竞赛业务库':
            sections.append(('竞赛业务库', i))

    # 收集所有题目信息
    all_questions = []  # (bank, chapter, type, para_index, original_num, content)
    renumber_count = 0

    for si, (bank, bank_pos) in enumerate(sections):
        next_bank = sections[si + 1][1] if si + 1 < len(sections) else len(paras)

        ch_positions = []
        for i in range(bank_pos, next_bank):
            if paras[i].text.strip() in chapter_names:
                ch_positions.append((paras[i].text.strip(), i))

        for ci, (ch, ch_pos) in enumerate(ch_positions):
            next_ch = ch_positions[ci + 1][1] if ci + 1 < len(ch_positions) else next_bank

            type_positions = []
            for i in range(ch_pos, next_ch):
                txt = paras[i].text.strip()
                if re.match(r'^[一二三][\、．\.]', txt):
                    type_positions.append(i)

            for ti, type_pos in enumerate(type_positions):
                next_type = type_positions[ti + 1] if ti + 1 < len(type_positions) else next_ch
                type_text = paras[type_pos].text.strip()

                # 收集该题型下所有题目段落索引
                question_starts = []
                for i in range(type_pos + 1, next_type):
                    txt = paras[i].text.strip()
                    m = re.match(r'^(\d+)[\.\．]', txt)
                    if m:
                        question_starts.append((i, int(m.group(1)), txt))

                if not question_starts:
                    continue

                # 重新编号
                new_num = 1
                for idx, (para_idx, old_num, old_text) in enumerate(question_starts):
                    if old_num != new_num:
                        renumber_count += 1
                    # 替换序号
                    m = re.match(r'^(\d+)([\.\．].*)$', old_text)
                    if m:
                        new_text = str(new_num) + m.group(2)
                        # 更新段落文本（保留格式）
                        for run in paras[para_idx].runs:
                            if str(old_num) in run.text:
                                run.text = run.text.replace(str(old_num), str(new_num), 1)
                                break
                        else:
                            # 如果runs中没有找到，直接设置第一个run
                            if paras[para_idx].runs:
                                paras[para_idx].runs[0].text = new_text
                            else:
                                paras[para_idx].text = new_text

                    # 提取题干内容（去掉序号）
                    content = re.sub(r'^\d+[\.\．]', '', old_text).strip()
                    # 提取答案并清理
                    content_clean = re.sub(r'_{2,}[A-Za-z]+_{2,}', '____', content)
                    content_clean = re.sub(r'\([A-Za-z]+\)', '（）', content_clean)
                    content_clean = re.sub(r'（[A-Za-z]+）', '（）', content_clean)

                    all_questions.append({
                        'bank': bank,
                        'chapter': ch,
                        'type': type_text,
                        'old_num': old_num,
                        'new_num': new_num,
                        'para_idx': para_idx,
                        'content': content_clean
                    })

                    new_num += 1

    # 检测题干重复
    content_map = defaultdict(list)
    for q in all_questions:
        content_map[q['content']].append(q)

    dup_contents = {k: v for k, v in content_map.items() if len(v) > 1 and len(k) > 5}

    print(f'=== 重新编号统计 ===')
    print(f'共修改了 {renumber_count} 处序号')
    print()
    print(f'=== 题干重复检测 ===')
    print(f'共发现 {len(dup_contents)} 组重复题干')
    for idx, (content, qs) in enumerate(sorted(dup_contents.items(), key=lambda x: -len(x[1])), 1):
        print(f'\n【第{idx}组】重复{len(qs)}次:')
        print(f'  题干: {content[:80]}...' if len(content) > 80 else f'  题干: {content}')
        for q in qs:
            print(f'    {q["bank"]}/{q["chapter"]}/{q["type"]} 原序号{q["old_num"]}')

    # 保存重新编号后的文档
    doc.save(OUTPUT_PATH)
    print(f'\n已保存重新编号文档: {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
