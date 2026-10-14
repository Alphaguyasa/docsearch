"""
Builds data/bible-am.json: the 1962 Amharic Bible (the Haile Selassie
translation), keyed by the English book names our references use. Each book
is { "title": its Amharic title, "chapters": [[verse, ...], ...] }. Where the
Amharic joins verses ("2-3"), the first is "" and the text sits on the last.

  New Testament — the e-text "Amharic NT, Revised Amharic Bible in XML (2003)"
    (Lapsley/Brooks 1994, Dirk Röckmann 2003) from
    github.com/EtkAppsAdmin/Bibles-1, Amharic__Amharic_NT__amharic__LTR.txt,
    published with the Bible Society of Ethiopia's permission for
    non-commercial use. Its verse numbers match the English.
  Old Testament — github.com/magna25/amharic-bible-json (amharic_bible.json,
    parsed from wordproject.org). Leftover footnote marks and stray "a"/<br>
    are stripped; a few words still carry Latin transliteration and are left
    as they are, so the site never shows a passage containing them.

    python3 scripts/build-amharic-bible.py amharic_bible.json Amharic__Amharic_NT__amharic__LTR.txt

Printed version © United Bible Societies 1962; the Bible Society of Ethiopia.
Non-commercial use only, with that statement shown (see /about and /credits).
"""
import json, re, sys

BOOKS = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalm","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"]

def clean(v):
    v = v.replace("<br />", " ")
    v = re.split(r"\s{2,}(?:q\d*|vፕ)\b", v)[0]  # trailing footnotes: "  q2 …", "  vፕ"
    v = re.sub(r"\s+a$", "", v.strip())          # a stray "a" after the last word
    v = re.sub(r"\[see v\d+\]", "", v)
    v = v.replace("Dኒኤል", "ጵኒኤል")  # Peniel (Genesis 32:30-31), per the book's own footnote
    return re.sub(r"\s+", " ", v).strip()

ot_src = json.load(open(sys.argv[1], encoding="utf-8"))["books"]
assert len(ot_src) == 66
out = {}
for name, book in zip(BOOKS, ot_src):
    chapters = book["chapters"]
    for i, c in enumerate(chapters, 1):  # a few labels are stray words (Matthew 5 is "ማን")
        assert not c["chapter"].isdigit() or int(c["chapter"]) == i, (name, i)
    out[name] = {"title": book["title"].rstrip("።").strip(), "chapters": [[clean(v) for v in c["verses"]] for c in chapters]}

nt = {}
for line in open(sys.argv[2], encoding="utf-8"):
    p = line.rstrip("\r\n").split("||")
    if len(p) < 4:
        continue
    nt.setdefault(BOOKS[39 + int(p[0][:2]) - 40], {}).setdefault(int(p[1]), {})[int(p[2])] = p[3].strip()
for name, chapters in nt.items():
    last = max(chapters)
    out[name]["chapters"] = [
        [chapters.get(c, {}).get(v, "") for v in range(1, max(chapters.get(c, {0: ""})) + 1)] for c in range(1, last + 1)
    ]

json.dump(out, open("data/bible-am.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("books", len(out), "verses", sum(len(v) for b in out.values() for v in b["chapters"]))
