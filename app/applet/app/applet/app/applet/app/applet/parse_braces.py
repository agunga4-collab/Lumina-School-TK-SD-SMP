p = 'src/pages/Kindergarten/MidtermSummary.tsx'
content = open(p).read()

start_idx = content.find('{activeDraft ? (')
if start_idx == -1:
    start_idx = content.find('activeDraft ? (') - 1

print("start_idx:", start_idx, "text:", content[start_idx:start_idx+30])

stack = []
for i in range(start_idx, len(content)):
    char = content[i]
    if char == '{':
        stack.append(('{', i))
    elif char == '}':
        if not stack:
            print("Mismatched close } at index:", i, "around text:", content[i-50:i+50])
            break
        last, idx = stack.pop()
    elif char == '(':
        stack.append(('(', i))
    elif char == ')':
        if not stack:
            print("Mismatched close ) at index:", i)
            break
        last, idx = stack.pop()

print("Parsing complete. Stack size left:", len(stack))
if stack:
    print("Unclosed braces/parens stack top 5:")
    for item in stack[-5:]:
         line_no = content[:item[1]].count('\n') + 1
         print(f"{item[0]} opened at line {line_no} (idx {item[1]}) around text: {content[item[1]:item[1]+50]}")
