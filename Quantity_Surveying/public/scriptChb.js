import { SaveFile } from './script.js';
document.addEventListener("DOMContentLoaded", () => {
  let resContent;
  document.getElementById('formChb').addEventListener('submit', function(event) {
    event.preventDefault();
    try {
        let wallArea = parseFloat(document.getElementById('wallArea').value);
        let holeArea = parseFloat(document.getElementById('holeArea').value);
        let size = document.getElementById('chbType').value;
        let netArea = wallArea - holeArea;
        let piecesCHB = calculateNoChb(netArea);
        let plaster = calculatePlaster(netArea);
        let mortar = calculateMortar(size,netArea);
        
        const results = displayResults(wallArea, holeArea, netArea, piecesCHB, plaster, mortar,size);
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


function calculateMortar(size,area) {
    const mortarCementFactor = {
      "4": 0.522,
      "6": 1.018,
      "8": 1.5,
    };
    const mortarSandFactor = {
      "4": 0.0435,
      "6": 0.0844,
      "8": 0.1250,
    }
  
    const factorOfCement = mortarCementFactor[size] || 0; // Use get or default to 0
    if (factorOfCement === 0) {
      throw new Error("Invalid CHB Size. Choose from 4in, 6in, and 8in.");
    }
    const factorOfSand = mortarSandFactor[size] || 0; // Use get or default to 0
    if (factorOfSand === 0) {
      throw new Error("Invalid CHB Size. Choose from 4in, 6in, and 8in.");
    }
  
    const cement = Math.ceil(area * factorOfCement);
    let sand = (area * factorOfSand);
    sand = sand.toFixed(3);
    
  
    return {cement, sand, factorOfCement, factorOfSand};
  }

  function calculateNoChb (area){
      const pieces = Math.ceil(area *12.5);
      return pieces;
  }

  function calculatePlaster (area){
      const cement =  Math.ceil(area * 0.3);
      let sand = area * 0.025;
      sand = sand.toFixed(3);
      return {cement, sand};
  }

  
function displayResults(wallArea, holeArea, netArea, piecesCHB, plaster, mortar,size) {
    // Create HTML elements or text to display results
    const resultsContent1 = document.createElement('div');
    const buttonDownload = document.createElement('div')
    resultsContent1.innerHTML = `
      <h3>Solution:</h3>
      <ol>
        <li><h5>Net Area Calculation</h5></li>
          <p>Net Area = ${wallArea} - ${holeArea} = ${netArea} square meter</p>
        <li><h5>Concrete Materials Calculation</h5></li>
        <h5>Mortar</h5>
        <ul>
        <li><p>Cement = ${netArea} * ${mortar.factorOfCement} = ${mortar.cement} Bags</p></li>
        <li><p>Sand = ${netArea} * ${mortar.factorOfSand} = ${mortar.sand} cubic meter</p></li> 
        </ul>
        <li><h5>Plaster</h5></li>
        <ul>
        <li><p>Cement = ${netArea} * 0.3 = ${plaster.cement} Bags</p></li>
        <li><p>Sand = ${netArea} * 0.025 = ${plaster.sand} cubic meter</p></li> 
        </ul>
        <li><p>No. of CHB = ${netArea} * 12.5 = ${netArea*12.5} ≈ ${piecesCHB} pieces, ${size}inches CHB</p></li>
      </ol>
      <h3>Summary:</h3>
      <ol>
      <li><h5 class="inline">Net Area:</h5><p class="inline"> ${netArea} square meter</p></li>
      <li><h5>Concrete Materials:</h5></li>
      <ul>
        <li><p>Cement: ${mortar.cement} + ${plaster.cement} = ${parseInt(mortar.cement) + parseInt(plaster.cement)}Bags</p></li>
        <li><p>Sand: ${mortar.sand} + ${plaster.sand} = ${parseFloat(mortar.sand) + parseFloat(plaster.sand)} cubic meter</p></li>
      </ul>
      <li><p>No. of CHB: ${piecesCHB} pieces, ${size}inches CHB</p></li>
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

