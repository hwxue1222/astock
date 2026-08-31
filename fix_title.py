import re
with open('src/pages/LifelineMonitor.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = re.sub(r'title="[^"]*"', 'title="5阶段策略选股"', content, count=1)
with open('src/pages/LifelineMonitor.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('fixed')
