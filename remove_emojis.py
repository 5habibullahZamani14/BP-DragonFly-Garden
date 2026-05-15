import io

emojis = ['📅 ', '🛠️ ', '🔬 ', '📝 ', '🛬 ', '📅', '🛠️', '🔬', '📝', '🛬']

with io.open('LogBook.md', 'r', encoding='utf-8') as f:
    text = f.read()

for emoji in emojis:
    text = text.replace(emoji, '')

with io.open('LogBook.md', 'w', encoding='utf-8') as f:
    f.write(text)
