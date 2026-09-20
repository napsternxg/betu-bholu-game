"""Bake an editor-exported story JSON into the shipped defaults.

The in-game editor (title page > Edit) exports a full story snapshot:
  { "app": "betu-bholu-story", "version": 1, "exportedAt": ...,
    "dialogue": { "hi": {...}, "en": {...} },
    "chapters": [ {ch1}, {ch2}, ..., {ch9} ] }

When the user pastes that JSON in chat, save it to a file (e.g. /tmp/story.json)
and run:

    python3 tools/apply-story-json.py /tmp/story.json

It validates the snapshot and overwrites:
  public/content/dialogue/hi.json
  public/content/dialogue/en.json
  public/content/chapters/ch1.json ... ch9.json

Then rebuild (`npm run build`) and redeploy so the edited story becomes the
default for everyone. Editor snapshots already saved in a browser's
localStorage keep working on top.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONTENT = ROOT / 'public' / 'content'


def main() -> None:
    if len(sys.argv) != 2:
        print('usage: python3 tools/apply-story-json.py <snapshot.json>')
        sys.exit(1)
    snap = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))

    assert snap.get('app') == 'betu-bholu-story', 'not a betu-bholu story snapshot'
    assert isinstance(snap.get('dialogue', {}).get('hi'), dict), 'missing dialogue.hi'
    assert isinstance(snap.get('dialogue', {}).get('en'), dict), 'missing dialogue.en'
    chapters = snap.get('chapters')
    assert isinstance(chapters, list) and chapters, 'missing chapters'
    ids = [c.get('id') for c in chapters]
    assert ids == [f'ch{i}' for i in range(1, 10)], f'chapters must be ch1..ch9 in order, got {ids}'

    for lang in ('hi', 'en'):
        p = CONTENT / 'dialogue' / f'{lang}.json'
        p.write_text(json.dumps(snap['dialogue'][lang], ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'wrote {p.relative_to(ROOT)} ({len(snap["dialogue"][lang])} keys)')
    for c in chapters:
        p = CONTENT / 'chapters' / f'{c["id"]}.json'
        p.write_text(json.dumps(c, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(f'wrote {p.relative_to(ROOT)}')
    print('done — rebuild with: npm run build')


if __name__ == '__main__':
    main()
