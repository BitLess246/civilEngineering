document.addEventListener("DOMContentLoaded", () => {
  let resContent;
  document.getElementById('formColumn').addEventListener('submit', function(event) {
    event.preventDefault();
    try {
      let length = parseFloat(document.getElementById('length3').value);
      let width = parseFloat(document.getElementById('width3').value);
      let height = parseFloat(document.getElementById('height3').value);
      let numStructures = parseInt(document.getElementById('numStructures3').value);
      let concreteClass = document.getElementById('concreteClass3').value;
      let lengthPerPiece = parseFloat(document.getElementById('lengthPerPiece3').value);
      let numPieces = parseInt(document.getElementById('numPieces3').value);
      let diameter = parseFloat(document.getElementById('diameter3').value);
      let lengthPerSet = parseFloat(document.getElementById('lengthPerSet3').value);
      let noShearReinforcement = parseInt(document.getElementById('noShearReinforcement3').value);
      let lateralTieDiameter = parseFloat(document.getElementById('lateralTieDiameter3').value);
      let lengthPerCut = parseFloat(document.getElementById('lengthPerCut3').value);
      let numIntersections = parseInt(document.getElementById('numIntersections3').value);

      let volumeConc= calculateConcreteVolume(length,width,height,numStructures)
      console.log("volume")
      let materials = calculateConcreteMaterials(volume,concreteClass)
      console.log("conc materials")
      let mainSteel = calculateSteelWeight (lengthPerPiece,numPieces,diameter,numStructures)
      console.log("steel weight")
      let reinforcementSteel = calculateLateralTieWeight (lengthPerSet, noShearReinforcement, lateralTieDiameter,numStructures)
      console.log("reinf steel weight")
      let tieWire = calculateTieWire(lengthPerCut, numIntersections, numStructures)
      console.log("tie wire")
      
      // Call the displayResults function

      const results = displayResults(volumeConc, materials, mainSteel, reinforcementSteel, tieWire);
      resContent = results.innerText;
      console.log(results);
      console.log(resContent);
    } catch (error) {
      console.log(`An error occured:${error}`)
      alert(`An error occured:${error}`)
    } 
  });
  


  const saveButtonElement = document.getElementById("saveButton");
  saveButtonElement.addEventListener("click", function() {
    let defaultFileName = "file.txt"
    // Prompt the user for a filename
    let fileName = window.prompt("Enter a filename:", defaultFileName);
    // If the user cancels or enters an empty filename, do nothing
    if (!fileName) return;
    //downloadTextFile(resultDiv, fileName)
    downloadTextFile(resContent, fileName)
  });

function downloadTextFile(content, fileName){
  // fetch('/download',{
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'text/plain'
  //   },
  //   body: JSON.stringify({ text: content})
  // })
  // .then(response => response.blob())
  // .then(blob => {
  //   const url = window.URL.createObjectURL(blob);
  //   const a = document.createElement('a');
  //   a.style.display = 'none';
  //   a.href = url;
  //   a.download = fileName;
  //   document.body.appendChild(a);
  //   a.click();
  //   window.URL.revokeObjectURL(url);
  // })
  // .catch(error => console.error('Error:', error));
  const blob = new Blob([content], { type: 'text/plain' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
}

function calculateConcreteVolume(length, width, height, numStructures) {
    volume = (length * width * height * numStructures).toFixed(2) 
    return {volume , length, width, height};
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
    noOfPcs= Math.ceil(netLength/5.6) 
    steelWeight = (noOfPcs * 6 * area * 7850).toFixed(2)
    return {steelWeight, area, netLength, dia, noOfPcs, lengthPerPiece, num, numStructures };
  }

function calculateLateralTieWeight(lengthPerSet, noShearReinforcement, lateralTieDiameter, numStructures) {
    netLength = (lengthPerSet * noShearReinforcement  * numStructures).toFixed(2)
    area = (((Math.PI)/4)*lateralTieDiameter**2)
    noOfPcs= Math.ceil(netLength/5.6) 
    steelWeight = (noOfPcs * 6 * area * 7850).toFixed(2)
    return {steelWeight, area, netLength, lateralTieDiameter, noOfPcs, lengthPerSet, noShearReinforcement, numStructures };
  }


function calculateTieWire(lengthPerCut, numIntersections, numStructures) {
    netLength = (lengthPerCut * numIntersections  * numStructures).toFixed(2)
    noRolls = Math.ceil(netLength/2385)
    return {netLength, noRolls, lengthPerCut, numIntersections, numStructures};
  }  


function displayResults(volumeConc, materials, mainSteel, reinforcementSteel, tieWire) {
    // Create HTML elements or text to display results
    const resultsContent1 = document.createElement('div');
    const buttonDownload = document.createElement('div')
    resultsContent1.innerHTML = `
      <h3>Solution:</h3>
      <ol>
        <li><h5>Concrete Volume Calculation</h5></li>
          <p>Volume = ${volumeConc.length} * ${volumeConc.width} * ${volumeConc.height} = ${volumeConc.volume} cubic meter</p>
        <li><h5>Concrete Materials Calculation</h5></li>
        <ul>
        <li><p>Cement = ${volumeConc.volume} * ${materials.factorOfCement} = ${materials.cement} Bags</p></li>
        <li><p>Sand = ${volumeConc.volume} * 0.5 = ${materials.sand} cubic meter</p></li>
        <li><p>Gravel = ${volumeConc.volume} * 1 = ${materials.gravel} cubic meter</p></li>
      </ul>
        <li><h5>Steel Weight Calculation</h5></li>
          <p><h5>Main Reinforcements:</h5></p>
          <p>Net length = ${mainSteel.lengthPerPiece} * ${mainSteel.num} *${mainSteel.numStructures} = ${mainSteel.netLength} meters </p>
          <p>Area = (π/4) * ${mainSteel.dia}^2 = ${mainSteel.area.toFixed(6)} square meters</p>
          <p>No. of Bars = ${mainSteel.netLength} / 5.6 ≈ ${mainSteel.noOfPcs} pieces</p>
          <p>Steel Weight = ${mainSteel.noOfPcs} * 6 * ${mainSteel.area.toFixed(6)} * 7850 = ${mainSteel.steelWeight} kilograms</p>
          <p><h5>Lateral Ties:</h5></p>
          <p>Net length = ${reinforcementSteel.lengthPerSet} * ${reinforcementSteel.noShearReinforcement} *${reinforcementSteel.numStructures} = ${reinforcementSteel.netLength} meters </p>
          <p>Area = (π/4) * ${reinforcementSteel.lateralTieDiameter}^2 = ${reinforcementSteel.area.toFixed(6)} square meters</p>
          <p>No. of Bars = ${reinforcementSteel.netLength} / 5.6 ≈ ${reinforcementSteel.noOfPcs} pieces</p>
          <p>Steel Weight = ${reinforcementSteel.noOfPcs} * 6 * ${reinforcementSteel.area.toFixed(6)} * 7850 = ${reinforcementSteel.steelWeight} kilograms</p>
        <li><h5>G.I. Tie Wire Calculation</h5></li>
          <p>Total Length = length per cut * number of intersections * number of structures</p>
          <p>Number of Rolls = total length / 2385</p>
          <p>Total Length =  ${tieWire.lengthPerCut} * ${tieWire.numIntersections} * ${tieWire.numStructures} = ${tieWire.netLength} meters</p>
          <p>Number of Rolls = ${tieWire.netLength} / 2385 = ${tieWire.netLength/2385} ≈ ${tieWire.noRolls} roll/s</p>
      </ol>
      <h3>Summary:</h3>
      <ol>
      <li><h5 class="inline">Volume:</h5><p> ${volumeConc.volume} cubic meter</p></li>
      <li><h5>Concrete Materials:</h5></li>
      <ul>
        <li><p>Cement: ${materials.cement} Bags</p></li>
        <li><p>Sand: ${materials.sand} cubic meter</p></li>
        <li><p>Gravel: ${materials.gravel} cubic meter</p></li>
      </ul>
      <li><h5>Steel Weight:</h5></li>
      <p><h5>Main Reinforcements:</h5></p>
      <p>Net Length: ${mainSteel.netLength} meters</p>
      <p>Area: ${mainSteel.area.toFixed(6)} square meters</p>
      <p>Steel Weight (⌀${mainSteel.dia*1000}mm): ${mainSteel.steelWeight} kilograms</p>
      <p><h5>Lateral Ties:</h5></p>
      <p>Net Length: ${reinforcementSteel.netLength} meters</p>
      <p>Area: ${reinforcementSteel.area.toFixed(6)} square meters</p>
      <p>Steel Weight (⌀${reinforcementSteel.lateralTieDiameter*1000}mm): ${reinforcementSteel.steelWeight} kilograms</p>
      <li><h5>Tie Wire</h5></li>
      <p>Net Length: ${tieWire.netLength} meters</p>
      <p>No. of Rolls: ${tieWire.noRolls} roll/s</p>
      </ol>
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
    document.getElementById('saveButton').style.display = 'block';

    return resultsContent1;

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