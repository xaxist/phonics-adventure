export const pronunciationFixes: Record<string, string> = {
  "cab": "kabb",
  "sap": "sapp",
  "mac": "mack",
  "nab": "nabb",
  "gab": "gabb",
  "tab": "tabb",
  "fad": "fadd",
  "tad": "tadd",
  "yam": "yamm",
  "wag": "wagg",
  "yap": "yapp",
  "zag": "zagg"
  // Expand this list as you discover more mispronunciations
};

export const getPhoneticSpelling = (text: string) => {
  // If it's a single word, check the dictionary directly
  const words = text.split(/\s+/);
  if (words.length === 1) {
    const cleanWord = text.toLowerCase().replace(/[^a-z]/g, '');
    if (pronunciationFixes[cleanWord]) {
      return pronunciationFixes[cleanWord];
    }
    return text;
  }
  
  // For sentences, replace words that match exactly
  return words.map(word => {
    const cleanWord = word.toLowerCase().replace(/[^a-z]/g, '');
    if (pronunciationFixes[cleanWord]) {
      // replace the word but keep surrounding punctuation if possible (simple substitution)
      return word.toLowerCase().replace(cleanWord, pronunciationFixes[cleanWord]);
    }
    return word;
  }).join(' ');
};
