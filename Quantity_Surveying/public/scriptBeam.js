import { SaveFile } from './script.js';
document.addEventListener("DOMContentLoaded", () => {
  let resContent;
  document.getElementById('formBeam').addEventListener('submit', function(event) {
    event.preventDefault();
    try {
      console.log("1")
      let length = parseFloat(document.getElementById('length2').value);
      let width = parseFloat(document.getElementById('width2').value);
      let height = parseFloat(document.getElementById('height2').value);
      let numStructures = parseInt(document.getElementById('numStructures2').value);
      let concreteClass = document.getElementById('concreteClass2').value;
      console.log("2")
      let topLengthPerPieceSupport = parseFloat(document.getElementById('topLengthPerPieceSupport').value);
      let numTopPiecesSupport = parseInt(document.getElementById('numTopPiecesSupport').value);
      let diameterTopSupport = parseFloat(document.getElementById('diameterTopSupport').value);
      let bottomLengthPerPieceSupport = parseFloat(document.getElementById('bottomLengthPerPieceSupport').value);
      let numBottomPiecesSupport = parseInt(document.getElementById('numBottomPiecesSupport').value);
      let diameterBottomSupport = parseFloat(document.getElementById('diameterBottomSupport').value);
      console.log("3")
      let topLengthPerPieceMidspan = parseFloat(document.getElementById('topLengthPerPieceMidspan').value);
      let numTopPiecesMidspan = parseInt(document.getElementById('numTopPiecesMidspan').value);
      let diameterTopMidspan = parseFloat(document.getElementById('diameterTopMidspan').value);
      let bottomLengthPerPieceMidspan = parseFloat(document.getElementById('bottomLengthPerPieceMidspan').value);
      let numBottomPiecesMidspan = parseInt(document.getElementById('numBottomPiecesMidspan').value);
      let diameterBottomMidspan = parseFloat(document.getElementById('diameterBottomMidspan').value);
      console.log("4")    
      let topSupNetLength = netLengthCalculation(topLengthPerPieceSupport,numTopPiecesSupport,numStructures);               
      let topMidNetLength = netLengthCalculation(topLengthPerPieceMidspan,numTopPiecesMidspan,numStructures);
      let botSupNetLength = netLengthCalculation(bottomLengthPerPieceSupport,numBottomPiecesSupport,numStructures);     
      let botMidNetLength = netLengthCalculation(bottomLengthPerPieceMidspan,numBottomPiecesMidspan,numStructures);
      console.log("5")
      let lengthPerSet = parseFloat(document.getElementById('lengthPerSet2').value);
      let noShearReinforcement = parseInt(document.getElementById('noShearReinforcement2').value);
      let lateralTieDiameter = parseFloat(document.getElementById('lateralTieDiameter2').value);
      let lengthPerCut = parseFloat(document.getElementById('lengthPerCut2').value);
      let numIntersections = parseInt(document.getElementById('numIntersections2').value);
      let textSteel ="";
      let textSteel2 ="";
      console.log("6")
      if (diameterBottomMidspan === diameterBottomSupport || diameterBottomMidspan === diameterTopMidspan || diameterBottomMidspan === diameterTopSupport){ 
        //Assuming that all diameters are the same
        console.log("7")
        let totalNetLength = (parseFloat(topSupNetLength.netLength) + parseFloat(topMidNetLength.netLength) + parseFloat(botSupNetLength.netLength) + parseFloat(botMidNetLength.netLength)).toFixed(2);
        let diameter = diameterTopSupport;
        let mainSteel = calculateSteelWeight(totalNetLength, diameter);
        textSteel = `
        <p>Net Length (Top Bars @ Support) = ${topSupNetLength.lengthPerPiece} * ${topSupNetLength.numBars} *${topSupNetLength.numStructures} = ${topSupNetLength.netLength} meters </p>
        <p>Net Length (Top Bars @ Midspan) = ${topMidNetLength.lengthPerPiece} * ${topMidNetLength.numBars} *${topMidNetLength.numStructures} = ${topMidNetLength.netLength} meters </p>
        <p>Net Length (Bottom Bars @ Support) = ${botSupNetLength.lengthPerPiece} * ${botSupNetLength.numBars} *${botSupNetLength.numStructures} = ${botSupNetLength.netLength} meters </p>
        <p>Net Length (Bottom Bars @ Midspan) = ${botMidNetLength.lengthPerPiece} * ${botMidNetLength.numBars} *${botMidNetLength.numStructures} = ${botMidNetLength.netLength} meters </p>
        <p>Total Net Length = ${topSupNetLength.netLength} + ${topMidNetLength.netLength} + ${botSupNetLength.netLength} + ${botMidNetLength.netLength} = ${totalNetLength} meters</p>
        <p>Area = (π/4) * ${mainSteel.dia}^2 = ${mainSteel.area.toFixed(6)} square meters</p>
        <p>No. of Bars = ${mainSteel.netLength} / 5.6 ≈ ${mainSteel.noOfPcs} pieces</p>
        <p>Steel Weight = ${mainSteel.noOfPcs} * 6 * ${mainSteel.area.toFixed(6)} * 7850 = ${mainSteel.steelWeight} kilograms</p>`
        textSteel2 = `
        <p>Net Length: ${mainSteel.netLength} meters</p>
        <p>Steel Weight (⌀${mainSteel.dia*1000}mm): ${mainSteel.steelWeight} kilograms</p>
        `;

        console.log("steel weight");
        } else {
        console.log("8");
        let mainSteelTopSup = calculateSteelWeight(topSupNetLength.netLength, diameterTopSupport);
        let mainSteelTopMid = calculateSteelWeight(topMidNetLength.netLength, diameterTopMidspan);
        let mainSteelBotSup = calculateSteelWeight(botSupNetLength.netLength, diameterBottomSupport);
        let mainSteelBotMid = calculateSteelWeight(botMidNetLength.netLength, diameterBottomMidspan);
        console.log("9");
        textSteel = `
        <p>Net Length (Top Bars @ Support) = ${topSupNetLength.lengthPerPiece} * ${topSupNetLength.numBars} *${topSupNetLength.numStructures} = ${topSupNetLength.netLength} meters </p>
        <p>Net Length (Top Bars @ Midspan) = ${topMidNetLength.lengthPerPiece} * ${topMidNetLength.numBars} *${topMidNetLength.numStructures} = ${topMidNetLength.netLength} meters </p>
        <p>Net Length (Bottom Bars @ Support) = ${botSupNetLength.lengthPerPiece} * ${botSupNetLength.numBars} *${botSupNetLength.numStructures} = ${botSupNetLength.netLength} meters </p>
        <p>Net Length (Bottom Bars @ Midspan) = ${botMidNetLength.lengthPerPiece} * ${botMidNetLength.numBars} *${botMidNetLength.numStructures} = ${botMidNetLength.netLength} meters </p>
        <p>Area (Top Bars @ Support) = (π/4) * ${mainSteelTopSup.dia}^2 = ${mainSteelTopSup.area.toFixed(6)} square meters</p>
        <p>Area (Top Bars @ Midspan) = (π/4) * ${mainSteelTopMid.dia}^2 = ${mainSteelTopMid.area.toFixed(6)} square meters</p>
        <p>Area (Bottom Bars @ Support) = (π/4) * ${mainSteelBotSup.dia}^2 = ${mainSteelBotSup.area.toFixed(6)} square meters</p>
        <p>Area (Bottom Bars @ Midspan) = (π/4) * ${mainSteelBotMid.dia}^2 = ${mainSteelBotMid.area.toFixed(6)} square meters</p>
        <p>No. of Bars (Top Bars @ Support) = ${mainSteelTopSup.netLength} / 5.6 ≈ ${mainSteelTopSup.noOfPcs} pieces</p>
        <p>No. of Bars (Top Bars @ Midspan) = ${mainSteelTopMid.netLength} / 5.6 ≈ ${mainSteelTopMid.noOfPcs} pieces</p>
        <p>No. of Bars (Bottom Bars @ Support) = ${mainSteelBotSup.netLength} / 5.6 ≈ ${mainSteelBotSup.noOfPcs} pieces</p>
        <p>No. of Bars (Bottom Bars @ Midspan) = ${mainSteelBotMid.netLength} / 5.6 ≈ ${mainSteelBotMid.noOfPcs} pieces</p>
        <p>Steel Weight (Top Bars @ Support, ⌀${mainSteelTopSup.dia*1000}mm) = ${mainSteelTopSup.noOfPcs} * 6 * ${mainSteelTopSup.area.toFixed(6)} * 7850 = ${mainSteelTopSup.steelWeight} kilograms</p>
        <p>Steel Weight (Top Bars @ Midspan, ⌀${mainSteelTopMid.dia*1000}mm) = ${mainSteelTopMid.noOfPcs} * 6 * ${mainSteelTopMid.area.toFixed(6)} * 7850 = ${mainSteelTopMid.steelWeight} kilograms</p>
        <p>Steel Weight (Bottom Bars @ Support, ⌀${mainSteelBotSup.dia*1000}mm) = ${mainSteelBotSup.noOfPcs} * 6 * ${mainSteelBotSup.area.toFixed(6)} * 7850 = ${mainSteelBotSup.steelWeight} kilograms</p>
        <p>Steel Weight (Bottom Bars @ Midspan, ⌀${mainSteelBotMid.dia*1000}mm) = ${mainSteelBotMid.noOfPcs} * 6 * ${mainSteelBotMid.area.toFixed(6)} * 7850 = ${mainSteelBotMid.steelWeight} kilograms</p>
        `;
        console.log("10");
        textSteel2 =`
        <p>Net Length (Top Bars @ Support) =  ${topSupNetLength.netLength} meters </p>
        <p>Net Length (Top Bars @ Midspan) =  ${topMidNetLength.netLength} meters </p>
        <p>Net Length (Bottom Bars @ Support) = ${botSupNetLength.netLength} meters </p>
        <p>Net Length (Bottom Bars @ Midspan) = ${botMidNetLength.netLength} meters </p>
        <p>Steel Weight (Top Bars @ Support, ⌀${mainSteelTopSup.dia*1000}mm) = ${mainSteelTopSup.steelWeight} kilograms</p>
        <p>Steel Weight (Top Bars @ Midspan, ⌀${mainSteelTopMid.dia*1000}mm) = ${mainSteelTopMid.steelWeight} kilograms</p>
        <p>Steel Weight (Bottom Bars @ Support, ⌀${mainSteelBotSup.dia*1000}mm) = ${mainSteelBotSup.steelWeight} kilograms</p>
        <p>Steel Weight (Bottom Bars @ Midspan, ⌀${mainSteelBotMid.dia*1000}mm) = ${mainSteelBotMid.steelWeight} kilograms</p>
        `;
        console.log("steel weight");
        }
        
        console.log("11");
        let volumeConc= calculateConcreteVolume(length,width,height,numStructures);
        console.log("volume");
        let materials = calculateConcreteMaterials(volumeConc.volume,concreteClass);
        console.log("conc materials");
        
        let reinforcementSteel = calculateLateralTieWeight (lengthPerSet, noShearReinforcement, lateralTieDiameter,numStructures);
        console.log("reinf steel weight");
        let tieWire = calculateTieWire(lengthPerCut, numIntersections, numStructures);
        console.log("tie wire");
      
        // Call the displayResults function
        
        const results = displayResults(volumeConc, materials, reinforcementSteel, tieWire, textSteel, textSteel2);
        resContent = results.innerText;
        console.log(results);
        console.log(resContent);
    } catch (error) {
      console.log(`An error occured:${error}`)
      alert(`An error occured:${error}`)
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

function calculateSteelWeight(netLength, dia) {
  let area = (((Math.PI)/4)*dia**2)
  let noOfPcs= Math.ceil(netLength/5.6) 
  let steelWeight = (noOfPcs * 6 * area * 7850).toFixed(2)
  return {steelWeight, area, netLength, dia, noOfPcs };
}

function calculateLateralTieWeight(lengthPerSet, noShearReinforcement, lateralTieDiameter, numStructures) {
  const netLength = (lengthPerSet * noShearReinforcement  * numStructures).toFixed(2)
  const area = ((Math.PI)/4)*lateralTieDiameter**2
  const noOfPcs= Math.ceil(netLength/5.6) 
  const steelWeight = (noOfPcs * 6 * area * 7850).toFixed(2);
  return {steelWeight, area, netLength, lateralTieDiameter, noOfPcs, lengthPerSet, noShearReinforcement, numStructures };
}


function calculateTieWire(lengthPerCut, numIntersections, numStructures) {
  const netLength = (lengthPerCut * numIntersections  * numStructures).toFixed(2);
  const noRolls = Math.ceil(netLength/2385);
  return {netLength, noRolls, lengthPerCut, numIntersections, numStructures};
}  

function netLengthCalculation(lengthPerPiece, numBars, numStructures) {
  lengthPerPiece = parseFloat(lengthPerPiece);
  numBars = parseFloat(numBars);
  numStructures = parseFloat(numStructures);
  const netLength = (lengthPerPiece * numBars * numStructures).toFixed(2)
  return {netLength,lengthPerPiece, numBars, numStructures};
}
function displayResults(volumeConc, materials, reinforcementSteel, tieWire, text1, text2) {
  // Create HTML elements or text to display results
  const resultsContent1 = document.createElement('div');
  const buttonDownload = document.createElement('div');// Pwede ata wala na to
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
        ${text1}
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
    <p><h5>Lateral Ties:</h5></p>
    <p>Net Length: ${reinforcementSteel.netLength} meters</p>
    <p>Area: ${reinforcementSteel.area.toFixed(6)} square meters</p>
    <p>Steel Weight (⌀${reinforcementSteel.lateralTieDiameter*1000}mm): ${reinforcementSteel.steelWeight} kilograms</p>
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
  // Insert the results content into the result div
  resultDiv.appendChild(resultsContent1);
  //resultDiv.appendChild(buttonDownload);

  console.log("append");
  document.getElementById('saveButton').style.display = 'block';

  return resultsContent1;
}

});