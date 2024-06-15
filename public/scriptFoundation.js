import { SaveFile } from './script.js';
document.addEventListener("DOMContentLoaded", () => {
  let resContent;
  document.getElementById('formFoundation').addEventListener('submit', function(event) {
    event.preventDefault();
    try { 
    console.log("1")
        
        let length = parseFloat(document.getElementById('length').value);
        let width = parseFloat(document.getElementById('width').value);
        let height = parseFloat(document.getElementById('height').value);
        let numStructures = parseInt(document.getElementById('numStructures').value);
        let concreteClass = document.getElementById('concreteClass').value;
        let cementFactorSpecific = parseFloat(document.getElementById('cementFactor').value);
        console.log("2")
        //Square Foundation
        let lengthPerPiece = parseFloat(document.getElementById('lengthPerPiece').value);
        let numPieces = parseInt(document.getElementById('numPieces').value);
        let diameter = parseFloat(document.getElementById('diameter').value);
        //rectangularFoundation
        let longSpanLength = parseFloat(document.getElementById('longSpanLength').value);
        let numLongSpanPieces = parseInt(document.getElementById('numLongSpanPieces').value);
        let shortSpanLength = parseFloat(document.getElementById('shortSpanLength').value);
        let numShortSpanPieces = parseInt(document.getElementById('numShortSpanPieces').value);
        let longSpanDiameter = parseFloat(document.getElementById('longSpanDiameter').value);
        let shortSpanDiameter = parseFloat(document.getElementById('shortSpanDiameter').value);   
        //Tie Wire
        let lengthPerCut = parseFloat(document.getElementById('lengthPerCut').value);
        let numIntersections = parseInt(document.getElementById('numIntersections').value);
    
        //Calculations
       
        let volumeConc = calculateConcreteVolume(length,width,height,numStructures);
        let materials = calculateConcreteMaterials(volumeConc.volume,concreteClass,cementFactorSpecific);
        
        //Square
        let mainSteel = calculateSteelWeight(lengthPerPiece,numPieces,diameter,numStructures);
        let text1 =`
        <p>Net length = ${mainSteel.lengthPerPiece} * ${mainSteel.num} *${mainSteel.numStructures} = ${mainSteel.netLength} meters </p>
        <p>Area = (π/4) * ${mainSteel.dia}^2 = ${mainSteel.area.toFixed(6)} square meters</p>
        <p>No. of Bars = ${mainSteel.netLength} / 5.6 ≈ ${mainSteel.noOfPcs} pieces</p>
        <p>Steel Weight = ${mainSteel.noOfPcs} * 6 * ${mainSteel.area.toFixed(6)} * 7850 = ${mainSteel.steelWeight} kilograms</p>
        `;
        let text3 =`
        <p>Net Length: ${mainSteel.netLength} meters</p>
        <p>Steel Weight (⌀${mainSteel.dia*1000}mm): ${mainSteel.steelWeight} kilograms</p>
      
        `
        //Rectangular
        let longSteelWeight = calculateSteelWeight(longSpanLength,numLongSpanPieces,longSpanDiameter,numStructures);
        let shortSteelWeight = calculateSteelWeight(shortSpanLength,numShortSpanPieces,shortSpanDiameter,numStructures);
        let text2 =`
        <p><h5>@ Long Span</h5></p>
        <p>Net length = ${longSteelWeight.lengthPerPiece} * ${longSteelWeight.num} *${longSteelWeight.numStructures} = ${longSteelWeight.netLength} meters </p>
        <p>Area = (π/4) * ${longSteelWeight.dia}^2 = ${longSteelWeight.area.toFixed(6)} square meters</p>
        <p>No. of Bars = ${longSteelWeight.netLength} / 5.6 ≈ ${longSteelWeight.noOfPcs} pieces</p>
        <p>Steel Weight = ${longSteelWeight.noOfPcs} * 6 * ${longSteelWeight.area.toFixed(6)} * 7850 = ${longSteelWeight.steelWeight} kilograms</p>
        <h5>@ Short Span</h5>
        <p>Net length = ${shortSteelWeight.lengthPerPiece} * ${shortSteelWeight.num} *${shortSteelWeight.numStructures} = ${shortSteelWeight.netLength} meters </p>
        <p>Area = (π/4) * ${shortSteelWeight.dia}^2 = ${shortSteelWeight.area.toFixed(6)} square meters</p>
        <p>No. of Bars = ${shortSteelWeight.netLength} / 5.6 ≈ ${shortSteelWeight.noOfPcs} pieces</p>
        <p>Steel Weight = ${shortSteelWeight.noOfPcs} * 6 * ${shortSteelWeight.area.toFixed(6)} * 7850 = ${shortSteelWeight.steelWeight} kilograms</p>
        `;
        let text4 = `
        <p><h5>@ Long Span</h5></p>
        <p>Net Length: ${longSteelWeight.netLength} meters</p>
        <p>Steel Weight (⌀${longSteelWeight.dia*1000}mm): ${longSteelWeight.steelWeight} kilograms</p>
        <h5>@ Short Span</h5>
        <p>Net Length: ${shortSteelWeight.netLength} meters</p>
        <p>Steel Weight (⌀${shortSteelWeight.dia*1000}mm): ${shortSteelWeight.steelWeight} kilograms</p>
        
        `
        //Tie Wire
       
        let tieWire = calculateTieWire(lengthPerCut,numIntersections,numStructures);
        
        //Display
        console.log("4");

        if (isNaN(volumeConc.volume) || isNaN(materials.cement) || isNaN(tieWire.noRolls)){
            alert(`Please fill all appropriate fields`);
            const resultDiv = document.getElementById("result");
            resultDiv.innerHTML = '';
            document.getElementById('saveButton').style.display = 'none';
        } else {
        if(isNaN(mainSteel.steelWeight) && !isNaN(longSteelWeight.steelWeight) && !isNaN(shortSteelWeight.steelWeight)){
            const results = displayResults(volumeConc, materials,text2, text4, tieWire);
            resContent = results.innerText;
            console.log(results);
            console.log(resContent);
            console.log("5");
            console.log(mainSteel);
        } else if (!isNaN(mainSteel.steelWeight) && isNaN(longSteelWeight.steelWeight) && isNaN(shortSteelWeight.steelWeight)){
            const results = displayResults(volumeConc, materials,text1, text3, tieWire);
            resContent = results.innerText;
            console.log(results);
            console.log(resContent);
            console.log("6");
            console.log(mainSteel);
        } else if (isNaN(mainSteel.steelWeight) && isNaN(longSteelWeight.steelWeight) && isNaN(shortSteelWeight.steelWeight)){
            alert(`Please fill all appropriate fields`);
            const resultDiv = document.getElementById("result");
            resultDiv.innerHTML = '';
            document.getElementById('saveButton').style.display = 'none';
        } else if (!isNaN(mainSteel.steelWeight) && !isNaN(longSteelWeight.steelWeight) && !isNaN(shortSteelWeight.steelWeight)){
            alert(`Please select only one. Square or Rectangular Footing`);
            const resultDiv = document.getElementById("result");
            resultDiv.innerHTML = '';
            document.getElementById('saveButton').style.display = 'none';
        }
    }
        

        } catch (error) {
        console.log(`An error occured:${error}`);
        alert(`An error occured:${error}`);
        } 
    
    });

    const saveButtonElement = document.getElementById("saveButton");
    saveButtonElement.addEventListener("click", function(){
      SaveFile(resContent);
    });
    
function calculateConcreteVolume(length, width, height, numStructures) {
    const volume = (length * width * height * numStructures).toFixed(2) 
    return {volume , length, width, height, numStructures};
}
  
function calculateConcreteMaterials(volumeInCubicMeters, concreteClass,factor) {
    const factors = {
      "AA": 12,
      "A": 9,
      "B": 7.5,
      "C": 6,
    };
  
    let factorOfCement = factors[concreteClass.toUpperCase()] || 0; // Use get or default to 0
    if (factorOfCement === 0) {
      factorOfCement = factor;
    }
    
    const factorOfSand = 0.5;
    const factorOfGravel = 1.0;
  
    const cement = Math.ceil(volumeInCubicMeters * factorOfCement);
    const sand = (volumeInCubicMeters * factorOfSand).toFixed(2);
    const gravel = (volumeInCubicMeters * factorOfGravel).toFixed(2);
  
    return {cement, sand, gravel, factorOfCement};
    };

function calculateSteelWeight(lengthPerPiece, num, dia, numStructures) {
    const netLength = (lengthPerPiece * num  * numStructures).toFixed(2)
    const area = (((Math.PI)/4)*dia**2)
    const noOfPcs= Math.ceil(netLength/5.6) 
    const steelWeight = (noOfPcs * 6 * area * 7850).toFixed(2)
    return {steelWeight, area, netLength, dia, noOfPcs, lengthPerPiece, num, numStructures };
    };
  
    function calculateTieWire(lengthPerCut, numIntersections, numStructures) {
    const netLength = (lengthPerCut * numIntersections  * numStructures).toFixed(2)
    const noRolls = Math.ceil(netLength/2385)
    return {netLength, noRolls, lengthPerCut, numIntersections, numStructures};
    };  

    
function displayResults(volumeConc, materials, text, text2, tieWire) {
    // Create HTML elements or text to display results
    const resultsContent1 = document.createElement('div');
    const buttonDownload = document.createElement('div')
    resultsContent1.innerHTML = `
      <h3>Solution:</h3>
      <ol>
        <li><h5>Concrete Volume Calculation</h5></li>
          <p>Volume = ${volumeConc.length} * ${volumeConc.width} * ${volumeConc.height} * ${volumeConc.numStructures} = ${volumeConc.volume} cubic meter</p>
        <li><h5>Concrete Materials Calculation</h5></li>
        <ul>
        <li><p>Cement = ${volumeConc.volume} * ${materials.factorOfCement} = ${materials.cement} Bags</p></li>
        <li><p>Sand = ${volumeConc.volume} * 0.5 = ${materials.sand} cubic meter</p></li>
        <li><p>Gravel = ${volumeConc.volume} * 1 = ${materials.gravel} cubic meter</p></li>
      </ul>
        <li><h5>Steel Weight Calculation</h5></li>
          <p><h5>Main Reinforcements:</h5></p>
          ${text}
          <li><h5>G.I. Tie Wire Calculation</h5></li>
          <p>Total Length = length per cut * number of intersections * number of structures</p>
          <p>Number of Rolls = total length / 2385</p>
          <p>Total Length =  ${tieWire.lengthPerCut} * ${tieWire.numIntersections} * ${tieWire.numStructures} = ${tieWire.netLength} meters</p>
          <p>Number of Rolls = ${tieWire.netLength} / 2385 = ${tieWire.netLength/2385} ≈ ${tieWire.noRolls} roll/s</p>
      </ol>
      <h3>Summary:</h3>
      <ol>
      <li><h5 class="inline">Volume:</h5><p class="inline"> ${volumeConc.volume} cubic meter</p></li>
      <li><h5>Concrete Materials:</h5></li>
      <ul>
        <li><p>Cement: ${materials.cement} Bags</p></li>
        <li><p>Sand: ${materials.sand} cubic meter</p></li>
        <li><p>Gravel: ${materials.gravel} cubic meter</p></li>
      </ul>
      <li><h5>Steel Weight:</h5></li>
      <p><h5>Main Reinforcements:</h5></p>
      ${text2}
      <li><h5>Tie Wire:</h5></li>
      <p>Net Length: ${tieWire.netLength} meters</p>
      <p>No. of Rolls: ${tieWire.noRolls} roll/s</p>
      </ol>
    `;
    
    console.log("display");
    // Clear previous results if any
    const resultDiv = document.getElementById("result");
    resultDiv.innerHTML = '';
    console.log("cleared");
 
    resultDiv.appendChild(resultsContent1);
   

    console.log("append");
    document.getElementById('saveButton').style.display = 'block';

    return resultsContent1;

  }
});