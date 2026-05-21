# -*- coding: utf-8 -*-
"""解析积分系统题库Word文档，生成前端可用JSON数据"""
import re
import json
from docx import Document

DOC_PATH = r'积分系统题库（2022）2024.7.8.docx'
OUTPUT_PATH = r'questions.json'


def find_markers(paragraphs):
    """定位题库/章节/题型标记"""
    bank_starts = []
    chapter_starts = []
    type_starts = []

    for i, txt in enumerate(paragraphs):
        if txt == '应知应会业务库':
            bank_starts.append(('应知应会业务库', i))
        elif txt == '竞赛业务库':
            bank_starts.append(('竞赛业务库', i))
        elif txt in ('公共气象服务', '气象预警预报', '综合气象观测', '综合气象保障'):
            chapter_starts.append((txt, i))
        elif txt in ('一、单选题', '二、单选题'):
            type_starts.append(('单选题', i))
        elif txt in ('二、多选题', '一、多选题'):
            type_starts.append(('多选题', i))
        elif txt in ('三、判断题', '二、判断题'):
            type_starts.append(('判断题', i))

    return bank_starts, chapter_starts, type_starts


def build_sections(paragraphs):
    """构建题库层级结构"""
    bank_starts, chapter_starts, type_starts = find_markers(paragraphs)
    sections = []

    for bi, (bank_name, bank_pos) in enumerate(bank_starts):
        next_bank_pos = bank_starts[bi + 1][1] if bi + 1 < len(bank_starts) else len(paragraphs)
        chapters_in_bank = [(name, pos) for name, pos in chapter_starts if bank_pos < pos < next_bank_pos]

        chapter_list = []
        for ci, (ch_name, ch_pos) in enumerate(chapters_in_bank):
            next_ch_pos = chapters_in_bank[ci + 1][1] if ci + 1 < len(chapters_in_bank) else next_bank_pos
            types_in_ch = [(tname, tpos) for tname, tpos in type_starts if ch_pos < tpos < next_ch_pos]
            chapter_list.append({
                'name': ch_name,
                'start': ch_pos,
                'end': next_ch_pos,
                'types': types_in_ch
            })

        sections.append({
            'bank': bank_name,
            'start': bank_pos,
            'end': next_bank_pos,
            'chapters': chapter_list
        })

    return sections


def extract_answer_from_content(content):
    """从题干中提取答案标记，返回 (cleaned_content, answer_str or None)"""
    patterns = [
        (r'\(([A-Za-z]+)\)', False),
        (r'（([A-Za-z]+)）', False),
        (r'_{2,}([A-Za-z]+)_{2,}', True),
        (r'_([A-Za-z]+)_', True),
        (r'【([A-Za-z]+)】', False),
    ]

    for pat, use_underscore in patterns:
        m = re.search(pat, content)
        if m:
            answer = m.group(1).upper()
            if use_underscore:
                content = re.sub(pat, '____', content)
            else:
                content = re.sub(pat, '（  ）', content)
            return content, answer

    return content, None


def parse_choice_questions(texts, type_name, bank_name, chapter_name, start_id):
    """解析单选/多选题"""
    questions = []
    q_id = start_id

    i = 0
    while i < len(texts):
        txt = texts[i]
        if re.match(r'^\d+[\.\．]', txt):
            m = re.match(r'^(\d+)[\.\．](.*)', txt, re.DOTALL)
            if m:
                content = m.group(2).strip()
                content, answer = extract_answer_from_content(content)
                options = []

                j = i + 1
                while j < len(texts):
                    opt_txt = texts[j]
                    if re.match(r'^[A-E][\、\.\．\s]', opt_txt):
                        opt_match = re.match(r'^([A-E])[\、\.\．\s](.*)', opt_txt)
                        if opt_match:
                            options.append({
                                'label': opt_match.group(1),
                                'content': opt_match.group(2).strip()
                            })
                        j += 1
                    elif re.match(r'^\d+[\.\．]', opt_txt):
                        break
                    elif opt_txt in ('对', '错'):
                        break
                    else:
                        if options:
                            options[-1]['content'] += opt_txt
                        j += 1

                if answer and options:
                    questions.append({
                        'id': q_id,
                        'bank': bank_name,
                        'chapter': chapter_name,
                        'type': type_name,
                        'content': content,
                        'answer': answer,
                        'options': options
                    })
                    q_id += 1

                i = j
            else:
                i += 1
        else:
            i += 1

    return questions


def parse_judge_questions(texts, bank_name, chapter_name, start_id):
    """解析判断题"""
    questions = []
    q_id = start_id

    i = 0
    while i < len(texts):
        txt = texts[i]
        if re.match(r'^\d+[\.\．]', txt):
            m = re.match(r'^(\d+)[\.\．](.*)', txt, re.DOTALL)
            if m:
                content = m.group(2).strip()
                answer = None

                if i + 1 < len(texts) and texts[i + 1] in ('对', '错'):
                    answer = texts[i + 1]
                    i += 2
                else:
                    if content.endswith('对'):
                        answer = '对'
                        content = content[:-1].strip()
                    elif content.endswith('错'):
                        answer = '错'
                        content = content[:-1].strip()
                    i += 1

                if answer:
                    questions.append({
                        'id': q_id,
                        'bank': bank_name,
                        'chapter': chapter_name,
                        'type': '判断题',
                        'content': content,
                        'answer': answer,
                        'options': []
                    })
                    q_id += 1
                else:
                    i += 1
            else:
                i += 1
        else:
            i += 1

    return questions


def parse_docx():
    doc = Document(DOC_PATH)
    paragraphs = [p.text.strip() for p in doc.paragraphs]
    sections = build_sections(paragraphs)

    questions = []
    q_id = 0

    for section in sections:
        bank_name = section['bank']
        for chapter in section['chapters']:
            ch_name = chapter['name']
            for ti, (type_name, type_pos) in enumerate(chapter['types']):
                next_type_pos = chapter['types'][ti + 1][1] if ti + 1 < len(chapter['types']) else chapter['end']

                block_texts = []
                for idx in range(type_pos + 1, next_type_pos):
                    txt = paragraphs[idx]
                    if txt:
                        block_texts.append(txt)

                if type_name == '判断题':
                    parsed = parse_judge_questions(block_texts, bank_name, ch_name, q_id)
                else:
                    parsed = parse_choice_questions(block_texts, type_name, bank_name, ch_name, q_id)

                questions.extend(parsed)
                q_id += len(parsed)

    return questions


def main():
    questions = parse_docx()

    stats = {}
    for q in questions:
        key = f"{q['bank']}/{q['chapter']}/{q['type']}"
        stats[key] = stats.get(key, 0) + 1

    print("=== 题目统计 ===")
    for k, v in sorted(stats.items()):
        print(f"  {k}: {v}题")
    print(f"  总计: {len(questions)}题")

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print(f"\n已写入 {OUTPUT_PATH}")


if __name__ == '__main__':
    main()
