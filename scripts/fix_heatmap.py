with open('src/pages/MTSS/CaseDetail.tsx', 'r') as f:
    text = f.read()

# Fix key={}, title={}, onClick={() => navigate()}
old_block = '''                            {cicoStats.dailyEntries.slice(-20).map((entry, i) => (
                              <div 
                                key={} 
                                className={cn(
                                  "aspect-square rounded-md transition-all hover:scale-110 cursor-help flex items-center justify-center text-[8px] font-black text-white",
                                  entry.avgScore >= 3.2 ? "bg-emerald-500" : 
                                  entry.avgScore >= 2.5 ? "bg-amber-400" : "bg-rose-500"
                                )} 
                                title={}
                              >
                                {entry.avgScore.toFixed(1)}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic text-center py-2">Belum ada data harian</p>
                      )}
                    </div>

                    {/* Tombol menuju Spreadsheet Siswa */}
                    <button 
                      type="button"
                      onClick={() => navigate()}'''

new_block = '''                            {cicoStats.dailyEntries.slice(-20).map((entry, i) => (
                              <div 
                                key={`${entry.dateStr}-${i}`} 
                                className={cn(
                                  "aspect-square rounded-md transition-all hover:scale-110 cursor-help flex items-center justify-center text-[8px] font-black text-white",
                                  entry.avgScore >= 3.2 ? "bg-emerald-500" : 
                                  entry.avgScore >= 2.5 ? "bg-amber-400" : "bg-rose-500"
                                )} 
                                title={`${entry.dayName}, ${entry.dateLabel}: Skor ${entry.avgScore.toFixed(1)} / 4.0 (${entry.pct.toFixed(0)}%)`}
                              >
                                {entry.avgScore.toFixed(1)}
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic text-center py-2">Belum ada data harian</p>
                      )}
                    </div>

                    {/* Tombol menuju Spreadsheet Siswa */}
                    <button 
                      type="button"
                      onClick={() => navigate(`/mtss/spreadsheet?studentId=${mtssCase.studentId}&classId=${mtssCase.classId}`)}'''

assert old_block in text, "old_block not found"
text = text.replace(old_block, new_block)

with open('src/pages/MTSS/CaseDetail.tsx', 'w') as f:
    f.write(text)

print("Fixed heatmap and navigate button successfully")
