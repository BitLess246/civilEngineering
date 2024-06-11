
document.addEventListener("DOMContentLoaded", () => {
  let resContent;
  document.getElementById('formColumn').addEventListener('submit', function(event) {
    event.preventDefault();
    try {
      const length = parseFloat(document.getElementById('length3').value);
      const width = parseFloat(document.getElementById('width3').value);
      const height = parseFloat(document.getElementById('height3').value);
      const numStructures = parseInt(document.getElementById('numStructures3').value);
      const concreteClass = document.getElementById('concreteClass3').value;
      let lengthPerPiece = parseFloat(document.getElementById('lengthPerPiece3').value);
      let numPieces = parseInt(document.getElementById('numPieces3').value);
      let diameter = parseFloat(document.getElementById('diameter3').value);
      let lengthPerSet = parseFloat(document.getElementById('lengthPerSet3').value);
      let noShearReinforcement = parseInt(document.getElementById('noShearReinforcement3').value);
      let lateralTieDiameter = parseFloat(document.getElementById('lateralTieDiameter3').value);
      let lengthPerCut = parseFloat(document.getElementById('lengthPerCut3').value);
      let numIntersections = parseInt(document.getElementById('numIntersections3').value);

      const volumeConc= calculateConcreteVolume(length,width,height,numStructures)
      console.log("volume")
      const materials = calculateConcreteMaterials(volume,concreteClass)
      console.log("conc materials")
      const mainSteel = calculateSteelWeight (lengthPerPiece,numPieces,diameter,numStructures)
      console.log("steel weight")
      const reinforcementSteel = calculateLateralTieWeight (lengthPerSet, noShearReinforcement, lateralTieDiameter,numStructures)
      console.log("reinf steel weight")
      const tieWire = calculateTieWire(lengthPerCut, numIntersections, numStructures)
      console.log("tie wire")
      
      // Call the displayResults function
      /* const results = */displayResults(volumeConc, materials, mainSteel, reinforcementSteel, tieWire);
      // resContent = results;
    } catch (error) {
      console.log(`An error occured:${error}`)
      alert(`An error occured:${error}`)
    } 
  });

function downloadTextFile(content, fileName){
  const text = content
  fetch('/download',{
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({xml: text})
  })
  .then(response => response.blob())
  .then(blob => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  })
  .catch(error => console.error('Error:', error));
}

function calculateConcreteVolume(length, width, height, numStructures) {
    volume = length * width * height * numStructures 
    return volume.toFixed(2);
  }

function calculateConcreteMaterials(volumeInCubicMeters, concreteClass) {
    const factors = {
      "AA": 12,
      "A": 9,
      "B": 7.5,
      "C": 6,
    };
  
    const factorOfCement = factors[concreteClass.toUpperCase()] || 0; // Use get or default to 0
    if (factorOfCement === 0) {
      throw new Error("Invalid concrete class. Choose from AA, A, B, or C.");
    }
  
    const factorOfSand = 0.5;
    const factorOfGravel = 1.0;
  
    const cement = Math.ceil(volumeInCubicMeters * factorOfCement);
    const sand = (volumeInCubicMeters * factorOfSand).toFixed(2);
    const gravel = (volumeInCubicMeters * factorOfGravel).toFixed(2);
  
    return {cement, sand, gravel, factorOfCement};
  }

function calculateSteelWeight(lengthPerPiece, num, dia, numStructures) {
    netLength = (lengthPerPiece * num  * numStructures).toFixed(2)
    area = (((Math.PI)/4)*dia**2)
    steelWeight = (netLength * area * 7850).toFixed(2)
    return {steelWeight, area, netLength, dia };
  }

function calculateLateralTieWeight(lengthPerSet, noShearReinforcement, lateralTieDiameter, numStructures) {
    netLength = (lengthPerSet * noShearReinforcement  * numStructures).toFixed(2)
    area = (((Math.PI)/4)*lateralTieDiameter**2)
    steelWeight = (netLength * area * 7850).toFixed(2)
    return {steelWeight, area, netLength, lateralTieDiameter };
  }


function calculateTieWire(lengthPerCut, numIntersections, numStructures) {
    netLength = (lengthPerCut * numIntersections  * numStructures).toFixed(2)
    noRolls = Math.ceil(netLength/2385)
    return {netLength, noRolls};
  }  


function displayResults(volumeConc, materials, mainSteel, reinforcementSteel, tieWire) {
    // Create HTML elements or text to display results
    const resultsContent1 = document.createElement('div');
    const buttonDownload = document.createElement('div')
    resultsContent1.innerHTML = `
      <h3>Summary:</h3>
      <p>Volume: ${volumeConc} cubic meter</p>
      <p>Concrete Materials:</p>
      <ul>
        <li>Cement: ${materials.cement} Bags</li>
        <li>Sand: ${materials.sand} cubic meter</li>
        <li>Gravel: ${materials.gravel} cubic meter</li>
      </ul>
      <p>Main Reinforcements:</p>
      <p>Net Length: ${mainSteel.netLength} meters</p>
      <p>Area: ${mainSteel.area.toFixed(6)} square meters</p>
      <p>Steel Weight (⌀${mainSteel.dia*1000}mm): ${mainSteel.steelWeight} kilograms</p>
      <p>Lateral Ties:</p>
      <p>Net Length: ${reinforcementSteel.netLength} meters</p>
      <p>Area: ${reinforcementSteel.area.toFixed(6)} square meters</p>
      <p>Steel Weight (⌀${reinforcementSteel.lateralTieDiameter*1000}mm): ${reinforcementSteel.steelWeight} kilograms</p>
      <p>Tie Wire</p>
      <p>Net Length: ${tieWire.netLength} meters</p>
      <p>No. of Rolls: ${tieWire.noRolls} roll/s</p>
    `;
    const xmlContent = 
    `<?xml version="1.0" encoding="UTF-8"?>
    <summary>
      <description>Summary</description>
      <volume>Volume: ${volumeConc} cubic meter</volume>
      <concreteMaterials>
        <description>Concrete Materials:</description>
        <cement>Cement: ${materials.cement} Bags</cement>
        <sand>Sand: ${materials.sand} cubic meter</sand>
        <gravel>Gravel: ${materials.gravel} cubic meter</gravel>
      </concreteMaterials>
      <mainReinforcements>
        <description>Main Reinforcements:</description>
        <netLength>Net Length: ${mainSteel.netLength} meters</netLength>
        <area>Area: ${mainSteel.area.toFixed(6)} square meters</area>
        <steelWeight> Steel Weight diameter (${mainSteel.dia*1000}mm): ${mainSteel.steelWeight} kilograms</steelWeight>
      </mainReinforcements>
      <lateralTies>
        <description>Lateral Ties:</description>
        <netLength>Net Length: ${reinforcementSteel.netLength} meters</netLength>
        <area>Area: ${reinforcementSteel.area.toFixed(6)} square meters</area>
        <steelWeight> Steel Weight diameter (${reinforcementSteel.lateralTieDiameter*1000}mm): ${reinforcementSteel.steelWeight} kilograms</steelWeight>
      </lateralTies>
      <tieWire>
        <description>Tie Wire:</description>
        <netLength>Net Length: ${tieWire.netLength} meters</netLength>
        <rolls>Rolls: ${tieWire.noRolls} roll/s</rolls>
      </tieWire>
    </summary>`;
    // buttonDownload.innerHTML =`
    // <button id="saveButton">Save</button>
    // `
    console.log("display");
    // Clear previous results if any
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = '';
    console.log("cleared");
    // Insert the results content into the result div
    resultDiv.appendChild(resultsContent1);
    //resultDiv.appendChild(buttonDownload);
    console.log("append");
    
    const saveButtonElement = document.getElementById("saveButton");
    saveButtonElement.addEventListener("click", () => {
      let defaultFileName = "file.txt"
        // Prompt the user for a filename
      let fileName = window.prompt("Enter a filename:", defaultFileName);
      // If the user cancels or enters an empty filename, do nothing
      if (!fileName) return;
      //downloadTextFile(resultDiv, fileName)
      downloadTextFile(xmlContent, fileName)
    });

    //return resultsContent1;
    
  }

//   function saveTextAsFile(textToSave, defaultFileName = "file.txt") {
//     // Prompt the user for a filename
//     var fileName = window.prompt("Enter a filename:", defaultFileName);
    
//     // If the user cancels or enters an empty filename, do nothing
//     if (!fileName) return;

//     // Create a Blob object with the text content
//     var blob = new Blob([textToSave], {type: "text/plain"});

//     // Create a temporary URL for the Blob
//     var url = URL.createObjectURL(blob);

//     // Create an <a> element to trigger the download
//     var a = document.createElement("a");
//     a.href = url;
//     a.download = fileName;

//     // Append the <a> element to the document and trigger the download
//     document.body.appendChild(a);
//     a.click();

//     // Cleanup: revoke the temporary URL and remove the <a> element
//     window.URL.revokeObjectURL(url);
//     document.body.removeChild(a);
// }

});