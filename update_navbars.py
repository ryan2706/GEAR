import glob
from pathlib import Path

# Extract navbar snippet from index.html
navbar_lines = []
inside = False
with open('index.html', 'r', encoding='utf-8') as f:
    for line in f:
        if '<!-- navbar begins -->' in line:
            inside = True
        if inside:
            navbar_lines.append(line)
        if '<!-- navbar ends -->' in line and inside:
            break

navbar = ''.join(navbar_lines)

# Iterate over all HTML files
for filepath in glob.glob('**/*.html', recursive=True):
    p = Path(filepath)
    content = p.read_text(encoding='utf-8')
    if '<!-- navbar begins -->' in content and '<!-- navbar ends -->' in content:
        start = content.index('<!-- navbar begins -->')
        end = content.index('<!-- navbar ends -->') + len('<!-- navbar ends -->')
        new_content = content[:start] + navbar + content[end:]
    else:
        # Insert navbar after opening <body> tag
        if '<body' in content:
            body_index = content.index('<body')
            body_end = content.find('>', body_index) + 1
            new_content = content[:body_end] + '\n  ' + navbar + '\n' + content[body_end:]
        else:
            # If no body tag, prepend navbar
            new_content = navbar + '\n' + content
    p.write_text(new_content, encoding='utf-8')
