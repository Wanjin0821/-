from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


PDF_PATH = Path(
    "/Volumes/拓展盘一/李宛津工作文件（福源）/竞赛/2026.7 集团人工智能竞赛/题库/附件3：人工智能（发电产业）技能大赛培训题库.pdf"
)


SECTION_NAMES = {
    "single": "单选题",
    "multiple": "多选题",
    "judge": "判断题",
    "essay": "论述题",
}

SECTION_MARKERS = {
    "single": "一、单选题",
    "multiple": "二、多选题",
    "judge": "三、判断题",
    "essay": "四、论述题",
}


def normalize_text(text: str) -> str:
    text = text.replace("\u3000", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def clean_line_noise(text: str) -> str:
    noisy = {
        "中国华电集团有限公司",
        "第 1 届人工智能（发电产业）技能大赛",
        "培训题库",
    }
    lines: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            lines.append("")
            continue
        if line in noisy:
            continue
        if re.fullmatch(r"第 \d+ 页 共 \d+ 页", line):
            continue
        lines.append(line)
    return "\n".join(lines)


def extract_pdf_text(pdf_path: Path) -> str:
    reader = PdfReader(str(pdf_path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return normalize_text("\n".join(pages))


def content_sections(text: str) -> dict[str, str]:
    starts: dict[str, int] = {}
    for key, title in SECTION_NAMES.items():
        marker = SECTION_MARKERS[key]
        matches = [m.start() for m in re.finditer(rf"\n{re.escape(marker)}", text)]
        content_matches = [pos for pos in matches if pos > 300]
        if not content_matches:
            raise ValueError(f"未找到章节：{title}")
        starts[key] = content_matches[0]

    ordered = ["single", "multiple", "judge", "essay"]
    sections: dict[str, str] = {}
    for index, key in enumerate(ordered):
        start = starts[key]
        end = starts[ordered[index + 1]] if index + 1 < len(ordered) else len(text)
        body = text[start:end]
        body = re.sub(rf"^\n?{re.escape(SECTION_MARKERS[key])}\n?", "", body)
        sections[key] = clean_line_noise(body).strip()
    return sections


def split_numbered_blocks(section_text: str) -> list[tuple[int, str]]:
    matches = list(re.finditer(r"(?m)^(\d+)\.\s*", section_text))
    blocks: list[tuple[int, str]] = []
    for i, match in enumerate(matches):
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(section_text)
        number = int(match.group(1))
        blocks.append((number, section_text[start:end].strip()))
    return blocks


def split_expected_numbered_blocks(section_text: str, expected_count: int | None = None) -> list[tuple[int, str]]:
    matches = list(re.finditer(r"(?m)^(\d+)\.\s*", section_text))
    selected: list[re.Match[str]] = []
    expected = 1
    for match in matches:
        number = int(match.group(1))
        if number == expected:
            selected.append(match)
            expected += 1
            if expected_count and expected > expected_count:
                break

    blocks: list[tuple[int, str]] = []
    for i, match in enumerate(selected):
        start = match.start()
        end = selected[i + 1].start() if i + 1 < len(selected) else len(section_text)
        blocks.append((int(match.group(1)), section_text[start:end].strip()))
    return blocks


def compact(text: str) -> str:
    text = re.sub(r"\n+", "\n", text).strip()
    text = re.sub(r" *\n *", "\n", text)
    return text


def parse_options(text: str) -> tuple[str, list[dict[str, str]]]:
    option_matches = list(re.finditer(r"(?m)^([A-D])\.", text))
    if not option_matches:
        return compact(text), []

    prompt = text[: option_matches[0].start()].strip()
    options: list[dict[str, str]] = []
    for index, match in enumerate(option_matches):
        label = match.group(1)
        start = match.end()
        end = option_matches[index + 1].start() if index + 1 < len(option_matches) else len(text)
        options.append({"label": label, "text": compact(text[start:end])})
    return compact(prompt), options


def remove_answer_marker(prompt: str, answer: str) -> str:
    answer_pattern = re.escape(answer)
    prompt = re.sub(rf"[（(]\s*{answer_pattern}\s*[）)]", "", prompt)
    prompt = re.sub(r"（）", "", prompt)
    prompt = re.sub(r"\(\)", "", prompt)
    return compact(prompt)


def parse_choice_block(block: str, kind: str) -> dict[str, object]:
    number_match = re.match(r"^(\d+)\.\s*", block)
    if not number_match:
        raise ValueError(f"题目缺少题号：{block[:40]}")
    number = int(number_match.group(1))
    body = block[number_match.end() :].strip()
    prompt, options = parse_options(body)
    answer_matches = re.findall(r"[（(]\s*([A-D]{1,4})\s*[）)]", prompt)
    if not answer_matches:
        answer_matches = re.findall(r"[（(]\s*([A-D]{1,4})\s*[）)]", body)
    answer = "".join(sorted(answer_matches[-1])) if kind == "multiple" and answer_matches else (answer_matches[-1] if answer_matches else "")
    prompt = remove_answer_marker(prompt, answer) if answer else compact(prompt)
    if answer:
        for option in options:
            option["text"] = remove_answer_marker(option["text"], answer)
    return {
        "id": f"{kind}-{number}",
        "number": number,
        "type": kind,
        "typeName": SECTION_NAMES[kind],
        "question": prompt,
        "options": options,
        "answer": answer,
    }


def parse_judge_block(block: str) -> dict[str, object]:
    number_match = re.match(r"^(\d+)\.\s*", block)
    if not number_match:
        raise ValueError(f"判断题缺少题号：{block[:40]}")
    number = int(number_match.group(1))
    body = block[number_match.end() :].strip()
    answer_matches = re.findall(r"[（(]\s*([√×])\s*[）)]", body)
    answer_symbol = answer_matches[-1] if answer_matches else ""
    answer = "正确" if answer_symbol == "√" else "错误" if answer_symbol == "×" else ""
    prompt = re.sub(r"[（(]\s*[√×]\s*[）)]", "", body)
    return {
        "id": f"judge-{number}",
        "number": number,
        "type": "judge",
        "typeName": SECTION_NAMES["judge"],
        "question": compact(prompt),
        "options": [
            {"label": "正确", "text": "正确"},
            {"label": "错误", "text": "错误"},
        ],
        "answer": answer,
    }


def parse_essay_block(block: str) -> dict[str, object]:
    number_match = re.match(r"^(\d+)\.\s*", block)
    if not number_match:
        raise ValueError(f"论述题缺少题号：{block[:40]}")
    number = int(number_match.group(1))
    body = block[number_match.end() :].strip()
    paragraphs = [part.strip() for part in body.split("\n") if part.strip()]
    question_lines: list[str] = []
    answer_lines: list[str] = []
    seen_answer = False
    for line in paragraphs:
        if not seen_answer:
            question_lines.append(line)
            if re.search(r"[？?。｡]$", line):
                seen_answer = True
        else:
            answer_lines.append(line)
    if not answer_lines and len(question_lines) > 1:
        answer_lines = question_lines[1:]
        question_lines = question_lines[:1]
    return {
        "id": f"essay-{number}",
        "number": number,
        "type": "essay",
        "typeName": SECTION_NAMES["essay"],
        "question": compact("\n".join(question_lines)),
        "options": [],
        "answer": compact("\n".join(answer_lines)),
    }


def build_question_bank(pdf_path: Path) -> list[dict[str, object]]:
    text = extract_pdf_text(pdf_path)
    sections = content_sections(text)
    questions: list[dict[str, object]] = []

    for number, block in split_expected_numbered_blocks(sections["single"]):
        questions.append(parse_choice_block(block, "single"))
    for number, block in split_expected_numbered_blocks(sections["multiple"]):
        questions.append(parse_choice_block(block, "multiple"))
    for number, block in split_expected_numbered_blocks(sections["judge"]):
        questions.append(parse_judge_block(block))
    for number, block in split_expected_numbered_blocks(sections["essay"], expected_count=50):
        questions.append(parse_essay_block(block))

    for question in questions:
        if question["type"] != "essay" and not question["answer"]:
            print(f"警告：未解析到答案 {question['id']}", file=sys.stderr)
    return questions


def main() -> None:
    out_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("src/questionBank.json")
    module_path = out_path.with_suffix(".js")
    questions = build_question_bank(PDF_PATH)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(questions, ensure_ascii=False, indent=2)
    out_path.write_text(payload, encoding="utf-8")
    module_path.write_text(f"window.QUESTION_BANK = {payload};\n", encoding="utf-8")
    stats: dict[str, int] = {}
    for item in questions:
        stats[item["typeName"]] = stats.get(item["typeName"], 0) + 1
    print(f"已生成 {out_path}")
    print(f"已生成 {module_path}")
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
