import { SaveFile } from './script.js';
document.addEventListener("DOMContentLoaded", () => {
  let resContent;
  document.getElementById('formBoxCulvert').addEventListener('submit', function(event) {
    event.preventDefault();
    try {
        console.log("1")
        let grossArea = parseFloat(document.getElementById('grossArea').value);//
        let holeArea = parseFloat(document.getElementById('holeArea').value);//
        let length = parseFloat(document.getElementById('length').value);//
        let concreteClass = document.getElementById('concreteClass').value;//
        let cementFactorSpecific = parseFloat(document.getElementById('cementFactor').value);//
        let spliceLength = parseFloat(document.getElementById('lengthPerSplice').value);
        let numLongitudinalTop = parseInt(document.getElementById('numLongitudinalTop').value);
        let diameterMainTop = parseFloat(document.getElementById('diameterMainTop').value);
        let numLongitudinalU = parseInt(document.getElementById('numLongitudinalU').value);
        let diameterMainU = parseFloat(document.getElementById('diameterMainU').value);
        let lengthTopBar = parseFloat(document.getElementById('lengthTopBar').value);
        let diaTopBar = parseFloat(document.getElementById('topBarDia').value);
        let lengthUBar = parseFloat(document.getElementById('lengthUBar').value);
        let diaUBar = parseFloat(document.getElementById('uBarDia').value);
        let space = parseFloat(document.getElementById('spacing').value);
        let lengthPerCut =parseFloat(document.getElementById('lengthPerCut3').value);
        console.log("2")
        let numLongitudinal = numLongitudinalTop + numLongitudinalU;
        //calculate
        let netArea = grossArea - holeArea;
        console.log("11");
        let mainSteel = calculateSteelWeight(length,numLongitudinalTop,numLongitudinalU,diameterMainTop,diameterMainU,spliceLength);
        console.log("12");
        let concVolume = calculateConcreteVolume(netArea,length);
        console.log("13");
        let materials = calculateConcreteMaterials(concVolume.volume,concreteClass,cementFactorSpecific);
        console.log("14");
        let rsb = calculateRSB(length,lengthTopBar,lengthUBar,space,diaTopBar,diaUBar); // return {no6Top, no6U, noRSB, netLengthTop, netLengthU, length,lengthTopBar,lengthUBar, space }
        console.log("15");
        let tieWire = calculateTieWire(lengthPerCut,rsb.noRSB,numLongitudinal);
        console.log("16");
        //display
        const results = displayResults(materials,mainSteel,rsb,concVolume,tieWire);
        console.log("17");
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
  
     
function calculateConcreteVolume(area, thickness) {
    let volume = parseFloat(area) * parseFloat(thickness); 
    volume = volume.toFixed(3);
    return {volume , area, thickness};
  }

function calculateConcreteMaterials(volumeInCubicMeters, concreteClass, factor) {
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
    const sand = (volumeInCubicMeters * factorOfSand).toFixed(3);
    const gravel = (volumeInCubicMeters * factorOfGravel).toFixed(3);
  
    return {cement, sand, gravel, factorOfCement};
  }

  function calculateSteelWeight(length, numTop, numU, diaTop, diaU , spliceLength) {
    let areaTop = (((Math.PI)/4)*diaTop**2);
    let areaU = (((Math.PI)/4)*diaU**2);
    let splice = 6 - spliceLength;
    let netLengthTop = length * numTop;
    let netLengthU = length * numU;
    let noOfPcsTop= Math.ceil(netLengthTop/splice);
    let noOfPcsU=Math.ceil(netLengthU/splice);
    let steelWeightTop = (noOfPcsTop * 6 * areaTop * 7850).toFixed(2);
    let steelWeightU = (noOfPcsU * 6 * areaU * 7850).toFixed(2);
    return {steelWeightTop, areaTop, netLengthTop, diaTop, noOfPcsTop, splice, length, numTop, numU, spliceLength, steelWeightU, areaU, netLengthU, diaU, noOfPcsU };
  }

function calculateRSB (length,lengthTopBar,lengthUBar, space,diaTop,diaU){
    let noRSB = Math.ceil(length/space) + 1;
    let netLengthTop = noRSB * lengthTopBar; 
    let netLengthU = noRSB * lengthUBar;
    let no6Top = Math.ceil(netLengthTop/6);
    let no6U = Math.ceil(netLengthU/6);
    let areaTop = (((Math.PI)/4)*diaTop**2);
    let areaU = (((Math.PI)/4)*diaU**2);
    let weightTop = (no6Top * 6 *7850 *areaTop);
    let weightU = (no6U * 6 *7850 *areaU);
    weightTop = weightTop.toFixed(2);
    weightU = weightU.toFixed(2);
    return {no6Top, no6U, noRSB, diaTop,diaU, areaTop,areaU,netLengthTop, netLengthU, length,lengthTopBar,lengthUBar, space, weightTop,weightU }
}
function calculateTieWire(lengthPerCut, noRSB, numLongitudinal ) {
    let numIntersections = noRSB * numLongitudinal; 
    let netLength = parseFloat(lengthPerCut) * parseInt(numIntersections) ;
    netLength = netLength.toFixed(2);
    const noRolls = Math.ceil(netLength/2385)
    return {netLength, noRolls, lengthPerCut, numIntersections};
  }  


function displayResults(materials,mainSteel,rsb,volumeConc,tieWire) {
    // Create HTML elements or text to display results
    const resultsContent1 = document.createElement('div');
    const buttonDownload = document.createElement('div')
    console.log("18");
    resultsContent1.innerHTML = `
      <h3>Solution:</h3>
      <ol>
        <li><h5>Concrete Volume Calculation</h5></li>
          <p>Volume = ${volumeConc.area.toFixed(3)} * ${volumeConc.thickness} = ${volumeConc.volume} cubic meter</p>
        <li><h5>Concrete Materials Calculation</h5></li>
        <ul>
        <li><p>Cement = ${volumeConc.volume} * ${materials.factorOfCement} = ${materials.cement} Bags</p></li>
        <li><p>Sand = ${volumeConc.volume} * 0.5 = ${materials.sand} cubic meter</p></li>
        <li><p>Gravel = ${volumeConc.volume} * 1 = ${materials.gravel} cubic meter</p></li>
      </ul>
        <li><h5>Steel Weight Calculation</h5></li>
          
          <h5>Longitudinal Bars:</h5> 
          <p><strong>Top Longitudinal Bars:</strong></p>
          <p>Net Length = ${mainSteel.length} * ${mainSteel.numTop} = ${mainSteel.netLengthTop} meters </p>
          <p>Area = (π/4) * ${mainSteel.diaTop}^2 = ${mainSteel.areaTop.toFixed(6)} square meters</p>
          <p>Effective Length = 6 - ${mainSteel.spliceLength} = ${mainSteel.splice} meters</p> 
          <p>No. of Bars = ${mainSteel.netLengthTop} / ${mainSteel.splice} ≈ ${mainSteel.noOfPcsTop} pieces</p>
          <p>Steel Weight = ${mainSteel.noOfPcsTop} * 6 * ${mainSteel.areaTop.toFixed(6)} * 7850 = ${mainSteel.steelWeightTop} kilograms</p>
          
          <p><strong>Bottom Longitudinal Bars:</strong></p>
          <p>Net Length = ${mainSteel.length} * ${mainSteel.numU} = ${mainSteel.netLengthU} meters </p>
          <p>Area = (π/4) * ${mainSteel.diaU}^2 = ${mainSteel.areaU.toFixed(6)} square meters</p>
          <p>Effective Length = 6 - ${mainSteel.spliceLength} = ${mainSteel.splice} meters</p> 
          <p>No. of Bars = ${mainSteel.netLengthU} / ${mainSteel.splice} ≈ ${mainSteel.noOfPcsU} pieces</p>
          <p>Steel Weight = ${mainSteel.noOfPcsU} * 6 * ${mainSteel.areaU.toFixed(6)} * 7850 = ${mainSteel.steelWeightU} kilograms</p>
          <h5>Reinforce Steel Bars:</h5> 
          <p>No. of RSB = ${rsb.length} / ${rsb.space} + 1 ≈ ${rsb.noRSB} pieces </p>
          <p>Total Length (Top Bars) = ${rsb.noRSB} * ${rsb.lengthTopBar} = ${rsb.netLengthTop} meters</p> 
          <p>Total Length (U-Bars) = ${rsb.noRSB} * ${rsb.lengthUBar} = ${rsb.netLengthU} meters</p>
          <p>No. 6m Top Bars = ${rsb.netLengthTop} / 6 ≈ ${rsb.no6Top} pieces</p>
          <p>No. 6m U-Bars = ${rsb.netLengthU} / 6 ≈ ${rsb.no6U} pieces</p>
          <p>Area (Top Bars) = (π/4) * ${rsb.diaTop}^2 = ${rsb.areaTop.toFixed(6)} square meters</p>
          <p>Area (U-Bars) = (π/4) * ${rsb.diaU}^2 = ${rsb.areaU.toFixed(6)} square meters</p>
          <p>Steel Weight (Top Bars) = ${rsb.no6Top} * 6 * ${rsb.areaTop.toFixed(6)} * 7850 = ${rsb.weightTop} kilograms</p>
          <p>Steel Weight (U-Bars) = ${rsb.no6U} * 6 * ${rsb.areaU.toFixed(6)} * 7850 = ${rsb.weightU} kilograms</p>
          <li><h5>G.I. Tie Wire Calculation</h5></li>
          <p>No. of Intersections = No. of RSB * No. of Long Bars
          <p>Total Length = length per cut * number of intersections * number of structures</p>
          <p>Number of Rolls = total length / 2385</p>
          <p>No. of Intersection = ${rsb.noRSB} * ${mainSteel.num} = ${tieWire.numIntersections} intersections</p>
          <p>Total Length =  ${tieWire.lengthPerCut} * ${tieWire.numIntersections} = ${tieWire.netLength} meters</p>
          <p>Number of Rolls = ${tieWire.netLength} / 2385 = ${tieWire.netLength/2385} ≈ ${tieWire.noRolls} roll/s</p>
      </ol>
      <h3>Summary:</h3>
      <ol>
      <li><p><strong>Volume:</strong> ${volumeConc.volume} cubic meter</p></li>
      <li><p><strong>Concrete Materials:</strong></p></li>
      <ul>
        <li><p>Cement: ${materials.cement} Bags</p></li>
        <li><p>Sand: ${materials.sand} cubic meter</p></li>
        <li><p>Gravel: ${materials.gravel} cubic meter</p></li>
      </ul>
      <li><p><strong>Steel Weight:</strong></p></li>
      <ul>
        <li><p><strong>Longitudinal Bars</strong></p></li>
            <p>Top Bars (⌀${mainSteel.diaTop*1000}mm): ${mainSteel.steelWeightTop} kilograms </p>
            <p>Bottom Bars (⌀${mainSteel.diaU*1000}mm): ${mainSteel.steelWeightU} kilograms </p>    
        <li><p>RSB (⌀${rsb.diaTop*1000}mm): ${parseFloat(rsb.weightTop)+parseFloat(rsb.weightU)} kilograms</p></li>
      </ul>
      <li><p><strong>Tie Wire:</p></strong></li>
      <ul>
        <li><p>Net Length: ${tieWire.netLength} meters</p></li>
        <li><p>No. of Rolls: ${tieWire.noRolls} roll/s</p></li>
      </ul>
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