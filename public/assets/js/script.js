// file: script.js
  function SaveFile(content, defaultFileName = "file.txt") {
    // Prompt the user for a filename
    let fileName = window.prompt("Enter a filename:", defaultFileName);
    // If the user cancels or enters an empty filename, do nothing
    if (!fileName) return;
    //downloadTextFile(resultDiv, fileName)
   
    const lines = content.split('\n');
    const nonBlankLines = lines.filter(line=>line.trim()!=='');
    const processedContent = nonBlankLines.join('\n');
    
    const blob = new Blob([processedContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  }
  
export { SaveFile };