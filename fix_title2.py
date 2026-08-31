import codecs
lines = codecs.open('src/pages/LifelineMonitor.tsx', 'r', 'utf-8').readlines()
lines[257] = '        title="5阶段策略选股"\n'
codecs.open('src/pages/LifelineMonitor.tsx', 'w', 'utf-8').writelines(lines)
print('done')
