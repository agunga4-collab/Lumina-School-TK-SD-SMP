const fs = require('fs');
const path = 'src/pages/Admin/SuperAdminPage.tsx';
let content = fs.readFileSync(path, 'utf8');

const parentEmailBlock = `                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Orang Tua</label>
                        <input 
                          type="email" 
                          value={formData.parentEmail}
                          onChange={(e) => setFormData({...formData, parentEmail: e.target.value})}
                          className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                          placeholder="ortu@gmail.com"
                        />
                      </div>`;

// Use a more relaxed search if exact fails
if (!content.includes(parentEmailBlock)) {
    console.log("Exact block not found, trying partial search...");
    const partialMatch = /<label[^>]*>Email Orang Tua<\/label>[\s\S]*?placeholder="ortu@gmail.com"/;
    const match = content.match(partialMatch);
    if (match) {
        console.log("Found partial match");
        // We'll just replace the whole student section based on the surrounding divs if possible
    }
}

const newBlock = `                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nama Ayah</label>
                          <input 
                            type="text" 
                            value={formData.fatherName || ''}
                            onChange={(e) => setFormData({...formData, fatherName: e.target.value})}
                            className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                            placeholder="Nama Ayah"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nama Ibu</label>
                          <input 
                            type="text" 
                            value={formData.motherName || ''}
                            onChange={(e) => setFormData({...formData, motherName: e.target.value})}
                            className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl text-sm italic font-medium focus:ring-2 focus:ring-blue-100"
                            placeholder="Nama Ibu"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className={cn(
                          "text-[10px] font-black uppercase tracking-widest ml-1 transition-all",
                          (!formData.fatherName && !formData.motherName) ? "text-gray-300" : "text-gray-400"
                        )}>
                          Email Orang Tua {(!formData.fatherName && !formData.motherName) && '(Isi nama ortu dulu)'}
                        </label>
                        <input 
                          type="email" 
                          disabled={!formData.fatherName && !formData.motherName}
                          value={formData.parentEmail}
                          onChange={(e) => setFormData({...formData, parentEmail: e.target.value})}
                          className={cn(
                            "w-full px-5 py-4 border-none rounded-2xl text-sm italic font-medium focus:ring-2 transition-all",
                            (!formData.fatherName && !formData.motherName) ? "bg-gray-50 opacity-50 cursor-not-allowed" : "bg-gray-50 focus:ring-blue-100"
                          )}
                          placeholder="ortu@gmail.com"
                        />
                      </div>`;

// Simple string replacement for the unique part
const targetString = content.includes(parentEmailBlock) ? parentEmailBlock : null;

if (targetString) {
    content = content.replace(targetString, newBlock);
    fs.writeFileSync(path, content);
    console.log("Successfully replaced block");
} else {
    // Last resort: find the label and the specific input
    const labelStr = '<label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Orang Tua</label>';
    if (content.includes(labelStr)) {
        // Find the div that contains this label
        // This is fragile but might work if the indentation is the issue
        const regex = /<div className="space-y-2">\s*<label className="text-\[10px\] font-black text-gray-400 uppercase tracking-widest ml-1">Email Orang Tua<\/label>[\s\S]*?<\/div>/;
        content = content.replace(regex, newBlock);
        fs.writeFileSync(path, content);
        console.log("Successfully replaced using regex");
    } else {
        console.log("Could not find label string either");
    }
}
