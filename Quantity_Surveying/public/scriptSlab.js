import { SaveFile } from './script.js';
document.addEventListener("DOMContentLoaded", () => {
  let resContent;
  document.getElementById('formSlab').addEventListener('submit', function(event) {
    event.preventDefault();
    try { 
        console.log(`1`);
        let slabArea = parseFloat(document.getElementById('slabArea').value);
        let thickness = parseFloat(document.getElementById('thickness').value);
        let numStructures = parseInt(document.getElementById('numStructures1').value);
        let concreteClass = document.getElementById('concreteClass1').value;
        //Steel Works
        console.log(`2`);
        let longSpanLength = parseFloat(document.getElementById('longSpanLength').value);
        let numLongSpanPieces = parseInt(document.getElementById('numLongSpanPieces').value);
        let shortSpanLength = parseFloat(document.getElementById('shortSpanLength').value);
        let numShortSpanPieces = parseInt(document.getElementById('numShortSpanPieces').value);
        let longSpanDiameter = parseFloat(document.getElementById('longSpanDiameter').value);
        let shortSpanDiameter = parseFloat(document.getElementById('shortSpanDiameter').value);
        //Tie Wire
        console.log(`3`);
        let lengthPerCut = parseFloat(document.getElementById('lengthPerCut1').value);
        let numIntersections = parseInt(document.getElementById('numIntersections1').value);
        //Calculations
        console.log(`4`);
        let volumeConc = calculateConcreteVolume(slabArea,thickness,numStructures);
        let materials = calculateConcreteMaterials(volumeConc.volume,concreteClass);
        let mainSteel1 = calculateSteelWeight(longSpanLength,numLongSpanPieces,longSpanDiameter,numStructures);
        let mainSteel2 = calculateSteelWeight(shortSpanLength,numShortSpanPieces,shortSpanDiameter,numStructures);
        let totalSteelWeight = parseFloat(mainSteel1.steelWeight) + parseFloat(mainSteel2.steelWeight);
        let tieWire = calculateTieWire(lengthPerCut,numIntersections,numStructures);
        //Display
        console.log(`5`);
        const results = displayResults(volumeConc, materials, mainSteel1,mainSteel2,totalSteelWeight, tieWire);
        resContent = results.innerText;
        console.log(results);
        console.log(resContent);
    } catch (error) {
        console.log(`An error occured:${error}`);
        alert(`An error occured:${error}`);
        } 
    
    });

    const saveButtonElement = document.getElementById("saveButton");
    saveButtonElement.addEventListener("click", function(){
      SaveFile(resContent);
    });

    
function calculateConcreteVolume(area, thickness, numStructures) {
    const volume = parseFloat(area) * parseFloat(thickness) * parseInt(numStructures) 
    volume.toFixed(2);
    return {volume , area, thickness, numStructures};
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
    const netLength = (lengthPerPiece * num  * numStructures).toFixed(2)
    const area = (((Math.PI)/4)*dia**2)
    const noOfPcs= Math.ceil(netLength/5.6) 
    const steelWeight = (noOfPcs * 6 * area * 7850).toFixed(2)
    return {steelWeight, area, netLength, dia, noOfPcs, lengthPerPiece, num, numStructures };
  }


function calculateTieWire(lengthPerCut, numIntersections, numStructures) {
    const netLength = parseFloat(lengthPerCut) * parseInt(numIntersections)  * parseFloat(numStructures)
    netLength.toFixed(2)
    const noRolls = Math.ceil(netLength/2385)
    return {netLength, noRolls, lengthPerCut, numIntersections, numStructures};
  }  


function displayResults(volumeConc, materials, mainSteel1,mainSteel2,totalSteelWeight, tieWire) {
    // Create HTML elements or text to display results
    const resultsContent1 = document.createElement('div');
    const buttonDownload = document.createElement('div')
    resultsContent1.innerHTML = `
      <h3>Solution:</h3>
      <ol>
        <li><h5>Concrete Volume Calculation</h5></li>
          <p>Volume = ${volumeConc.area} * ${volumeConc.thickness} * ${volumeConc.numStructures} = ${volumeConc.volume} cubic meter</p>
        <li><h5>Concrete Materials Calculation</h5></li>
        <ul>
        <li><p>Cement = ${volumeConc.volume} * ${materials.factorOfCement} = ${materials.cement} Bags</p></li>
        <li><p>Sand = ${volumeConc.volume} * 0.5 = ${materials.sand} cubic meter</p></li>
        <li><p>Gravel = ${volumeConc.volume} * 1 = ${materials.gravel} cubic meter</p></li>
      </ul>
        <li><h5>Steel Weight Calculation</h5></li>
          <p><h5>Main Reinforcements:</h5></p>
          <h5>@ Long Span</h5> 
          <p>Net length = ${mainSteel1.lengthPerPiece} * ${mainSteel1.num} *${mainSteel1.numStructures} = ${mainSteel1.netLength} meters </p>
          <p>Area = (π/4) * ${mainSteel1.dia}^2 = ${mainSteel1.area.toFixed(6)} square meters</p>
          <p>No. of Bars = ${mainSteel1.netLength} / 5.6 ≈ ${mainSteel1.noOfPcs} pieces</p>
          <p>Steel Weight = ${mainSteel1.noOfPcs} * 6 * ${mainSteel1.area.toFixed(6)} * 7850 = ${mainSteel1.steelWeight} kilograms</p>
          <h5>@ Short Span</h5> 
          <p>Net length = ${mainSteel2.lengthPerPiece} * ${mainSteel2.num} *${mainSteel2.numStructures} = ${mainSteel2.netLength} meters </p>
          <p>Area = (π/4) * ${mainSteel2.dia}^2 = ${mainSteel2.area.toFixed(6)} square meters</p>
          <p>No. of Bars = ${mainSteel2.netLength} / 5.6 ≈ ${mainSteel2.noOfPcs} pieces</p>
          <p>Steel Weight = ${mainSteel2.noOfPcs} * 6 * ${mainSteel2.area.toFixed(6)} * 7850 = ${mainSteel2.steelWeight} kilograms</p>
          <p>Total Steel Weight = ${mainSteel1.steelWeight} + ${mainSteel2.steelWeight} = ${totalSteelWeight} kilograms</p>
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
      <p><h5>@ Long Span</h5></p>
      <p>Net Length: ${mainSteel1.netLength} meters</p>
      <p>Steel Weight (⌀${mainSteel1.dia*1000}mm): ${mainSteel1.steelWeight} kilograms</p>
      <p><h5>@ Short Span</h5></p>
      <p>Net Length: ${mainSteel2.netLength} meters</p>
      <p>Steel Weight (⌀${mainSteel2.dia*1000}mm): ${mainSteel2.steelWeight} kilograms</p>
      <p>Total Steel Weight: ${totalSteelWeight} kilograms</p>
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