import { SaveFile } from './script.js';

document.addEventListener("DOMContentLoaded", () => {
    let resContent;

    document.getElementById('formFoundation').addEventListener('submit', function(event) {
        event.preventDefault();
        try {
            console.log("retrieved data");
            // Retrieve input values
            let constraints = 1;
            const type = document.getElementById('structureType').value;
            const deadLoad = parseFloat(document.getElementById('DeadLoad').value);
            const liveLoad = parseFloat(document.getElementById('LiveLoad').value);
            const depth = parseFloat(document.getElementById('Depth').value) * 1000;
            const barDia = parseInt(document.getElementById('BarDiameter').value);
            const method = parseInt(document.getElementById('Method').value);
            const columnWidth = parseInt(document.getElementById('ColumnWidth').value);
            const columnLocation = parseInt(document.getElementById('ColumnLocation').value);
            const soilBearingCapacity = parseFloat(document.getElementById('SoilBearingCapacity').value);
            const surcharge = parseFloat(document.getElementById('Surcharge').value);
            const fc = parseFloat(document.getElementById('fc').value);
            const fy = parseFloat(document.getElementById('fy').value);
            const λ = parseFloat(document.getElementById('λ').value);
            const unitWeightSoil = parseFloat(document.getElementById('UnitWeightSoil').value);
            const unitWeightConcrete = parseFloat(document.getElementById('UnitWeightConcrete').value);
            const limitLength = parseFloat(document.getElementById('Limitation').value);
            const ratioLengthL = parseFloat(document.getElementById('RatioL').value);
            const ratioLengthB = parseFloat(document.getElementById('RatioB').value); 
            constraints = parseInt(document.getElementById('LengthRestriction1').value);
            // Initialize default values
            console.log("initialize values");
            let dc = 250;
            let dc1 = 250;
            let dc2 = 250;
            const clearCover = 75;
            const solution = solutionMethod(method, type);
            let summaryContent = '';  // Summary content initialization
            let solutionContent = '';  // Solution content initialization

            // Display the results

            let punchingshear, beamshear,rectangularDimension,rectangularDimension1,squareDimension,beamShearResult, squareDimension1 , punchingShearVu , punchingShearVu1 , punchingShearVn , totalIterations = 0, ddd = 0;
            const resultDiv = document.getElementById("result");
            resultDiv.innerHTML = ''; // Clear previous results
            if (solution === 11) {
                // Logic for solution Isolated Square - Iteration Method
                console.log("Isolated Square - Iteration Method");
                let bRatio = 1;
                squareDimension = calculateDimensionSquare(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                console.log("calculated dimension");
                punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad, columnWidth, squareDimension.B2, squareDimension.B2,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                console.log("calculated Vu");
                let as = columnLoc(columnLocation);
                punchingShearVn = calculatePunchingShearVn(punchingShearVu.d, punchingShearVu.side, fc, λ, bRatio, as);
                console.log("calculated Vn");
                document.getElementById('result').appendChild(createHeader3(`Solution:`));
                document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation`));
                
                document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                document.getElementById('result').appendChild(createParagraph(`B = √Af = √${squareDimension.Af} = ${squareDimension.B1.toFixed(2)} = ${squareDimension.B2}m`));
                
                
                document.getElementById('result').appendChild(createParagraph(`d (effective depth) = D<sub>c</sub> - C<sub>c</sub> - d<sub>b</sub> = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu.d} mm`));
                document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B2} x ${squareDimension.B2} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B2} meters x ${squareDimension.B2} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                document.getElementById('result').appendChild(createParagraph(`C + d = ${columnWidth} mm + ${punchingShearVu.d} mm = ${punchingShearVu.side} mm`));
                document.getElementById('result').appendChild(createParagraph(`b<sub>o</sub> = 4 x (C + d) = 4 x (${columnWidth}mm + ${punchingShearVu.d}mm) = ${4*(punchingShearVu.d+columnWidth)}mm`));
                document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu.Pu.toFixed(2)} kN - ${punchingShearVu.qu.toFixed(2)} (${punchingShearVu.side / 1000} meter)<sup>2</sup> = ${punchingShearVu.Vu.toFixed(2)} kN`));
                document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x λ x √f'c x b<sub>o</sub> x d`));
                document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x ${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn1}KN`));
                document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/β) x λ x √f'c x b<sub>o</sub> x d`));
                document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/1) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn2}KN`));
                document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + a<sub>s</sub>d/b<sub>o</sub>) x λ x √f'c x b<sub>o</sub> x d`));
                document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/12) x (2 + (${as}x${punchingShearVu.d})/${4*(punchingShearVu.d+columnWidth)}) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn3}KN`));
                document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ${punchingShearVn.minVn.toFixed(2)}KN`));
                document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> ${punchingShearVn.minVntoFixed(2) > punchingShearVu.Vu.toFixed(2) ?">":"<" } V<sub>u</sub>`));
                document.getElementById('result').appendChild(createParagraph(`∴ ${punchingShearVn.minVntoFixed(2) > punchingShearVu.Vu.toFixed(2) ?"Passed":"Failed" } `));
                





                console.log("displayed first trial");
               
                while (punchingShearVu.Vu > punchingShearVn.minVn) {
                    console.log("iterating");
                    dc += 25;
                
                    squareDimension = calculateDimensionSquare(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                    console.log("calculated dimension");
                    punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad, columnWidth, squareDimension.B2, squareDimension.B2,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                    console.log("calculated Vu");
                    
                    punchingShearVn = calculatePunchingShearVn(punchingShearVu.d, punchingShearVu.side, fc, λ, bRatio, as);
                    console.log("calculated Vn");
                    document.getElementById('result').appendChild(createHeader3(`Solution:`));
                    document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation`));
                    
                    document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                    document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                    document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                    document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                    document.getElementById('result').appendChild(createParagraph(`B = √Af = √${squareDimension.Af} = ${toFixed(squareDimension.B1,2)} = ${squareDimension.B2}m`));
                    
                    
                    document.getElementById('result').appendChild(createParagraph(`d (effective depth) = D<sub>c</sub> - C<sub>c</sub> - d<sub>b</sub> = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu.d} mm`));
                    document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                    document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B2} x ${squareDimension.B2} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B2} meters x ${squareDimension.B2} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                    document.getElementById('result').appendChild(createParagraph(`C + d = ${columnWidth} mm + ${punchingShearVu.d} mm = ${punchingShearVu.side} mm`));
                    document.getElementById('result').appendChild(createParagraph(`b<sub>o</sub> = 4 x (C + d) = 4 x (${columnWidth}mm + ${punchingShearVu.d}mm) = ${4*(punchingShearVu.d+columnWidth)}mm`));
                    document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu.Pu.toFixed(2)} kN - ${punchingShearVu.qu.toFixed(2)} (${punchingShearVu.side / 1000} meter)<sup>2</sup> = ${punchingShearVu.Vu.toFixed(2)} kN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x λ x √f'c x b<sub>o</sub> x d`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x ${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn1}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/β) x λ x √f'c x b<sub>o</sub> x d`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/1) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn2}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + a<sub>s</sub>d/b<sub>o</sub>) x λ x √f'c x b<sub>o</sub> x d`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/12) x (2 + (${as}x${punchingShearVu.d})/${4*(punchingShearVu.d+columnWidth)}) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn3}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ${punchingShearVn.minVn.toFixed(2)}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> ${punchingShearVn.minVntoFixed(2) > punchingShearVu.Vu.toFixed(2) ?">":"<" } V<sub>u</sub>`));
                    document.getElementById('result').appendChild(createParagraph(`∴ ${punchingShearVn.minVntoFixed(2) > punchingShearVu.Vu.toFixed(2) ?"Passed":"Failed" } `));
                    
                
                }
                console.log("ended iteration");
                beamShearResult = calculateBeamShearBothAxes("square", dc, clearCover, barDia, squareDimension.B2 * 1000, squareDimension.B2 * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                document.getElementById('result').appendChild(beamShear(dc,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
               
            } else if (solution === 12) {
               
            } else if (solution === 21) {
               
            } else if (solution === 22) {
                     
            } 
        } catch (error) {
            console.error(`An error occurred: ${error}`);
            alert(`An error occurred: ${error}`);
        } 
    });

    // Save button functionality
    const saveButtonElement = document.getElementById("saveButton");
    saveButtonElement.addEventListener("click", function() {
        SaveFile(resContent);
    });
    
      
    function calculateDimensionSquare(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity) {
        const ds = depth - dc;
        const qnet = soilBearingCapacity - (unitWeightConcrete * dc / 1000) - (unitWeightSoil * ds / 1000) - surcharge;
        const P = deadLoad + liveLoad;
        const Af = P / qnet;
        const B1 = Math.sqrt(Af);
        const B2 = Math.ceil(B1 * 10) / 10;
        return { ds, qnet, P, Af, B1, B2 };
    }
    function calculateDimensionRectangular(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints) {
        const ds = depth - dc;
        const qnet = soilBearingCapacity - (unitWeightConcrete * dc / 1000) - (unitWeightSoil * ds / 1000) - surcharge;
        const P = deadLoad + liveLoad;
        const Af = P / qnet;
        let B1, B2 = 0
        if (constraints === 2) {
        B1 = Math.sqrt(Af);
        B2 = Math.ceil(B1 * 10) / 10;
        const length = Math.min(B2, limitLength);
        
            if (limitLength < B2) {
                const B3 = Af/limitLength;
                const B4 = limitLength
                const L = Math.ceil(B3 * 10) / 10;
                return { ds, qnet, P, Af, B1, B2, length, B3, B4 ,L, limitLength,ratioLengthL, ratioLengthB };
            } else {
                const B3 = B1;
                const B4 = B2;
                const L = B2;
                return { ds, qnet, P, Af, B1, B2, length, B3, B4, L, limitLength,ratioLengthL, ratioLengthB };
            } 
        
    } else if (constraints === 1) {
        const B3 = (Math.sqrt(ratioLengthB*ratioLengthL*Af))/ratioLengthB;
        const B4 = Math.ceil(B3 * 10) / 10;
        const L = (ratioLengthB/ratioLengthL)*B4;
        return { ds, qnet, P, Af, B1, B2, length, B3, B4, L, limitLength,ratioLengthL, ratioLengthB };
    } else if (constraints === 0) {
        throw new Error('No restrictions specified');
    }
    }    function calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad,  columnWidth, B, L, unitWeightSoil, unitWeightConcrete, surcharge,ds) {
        const d = dc - clearCover - barDia;
        const Pu = (1.2 * deadLoad) + (1.6 * liveLoad) + (1.2*((unitWeightSoil*ds/1000)+(unitWeightConcrete*dc/1000) + surcharge))*B*L;
        const qu = Pu / (L * B);
        const side = d + columnWidth;
        const Vu = Pu - (qu * (side * side / 1000000));
        return { d, Pu, qu, side, Vu, dc };
    }

function calculatePunchingShearVn(d, side, fc, λ, bRatio, as) {
    if (d === null || side === null || fc === null || λ === null || bRatio === null || as === null) {
        throw new Error('All parameters must be provided');
    }

    if (d < 0 || side < 0 || fc < 0 || λ < 0 || bRatio < 0 || as < 0) {
        throw new Error('All parameters must be positive numbers');
    }

    let Vn1 = 0.75 * (1 / 3) * λ * Math.sqrt(fc) * 4 * side * d / 1000;
    let Vn2 = 0.75 * (1 / 6) * (1 + (2 / bRatio)) * λ * Math.sqrt(fc) * 4 * side * d / 1000;
    let Vn3 = 0.75 * (1 / 12) * (2 + ((as * d) / (4*side))) * λ * Math.sqrt(fc) * 4 * side * d / 1000;
    let minVn = Math.min(Vn1, Vn2, Vn3);

    return { Vn1, Vn2, Vn3, minVn };
}
function columnLoc(columnLocation) {
    switch (columnLocation) {
        case 1:
            return 40; // Example value for a specific column location
        case 2:
            return 30; // Example value for another column location
        case 3:
            return 20; // Example value for another column location
        // Add more cases as necessary
        default:
            throw new Error('Invalid column location');
    }
}
    function solutionMethod(method, structureType) {
        if (structureType === "Isolated Square") {
            if (method === 1) return 11;
            if (method === 2) return 12;
          
        } else if (structureType === "Isolated Rectangular") {
            if (method === 1) return 21;
            if (method === 2) return 22;
        
        }
        // Extend logic for other types/methods
        return 0;
    }
    function solveForD(columnWidth, Vu, concreteWeight, fc) {
        const A = 1;
        const B = columnWidth;
        const C = - ((Vu*1000) / (concreteWeight * Math.sqrt(fc)));
    
        // Calculate the discriminant
        const discriminant = Math.pow(B, 2) - 4 * A * C;
    
        if (discriminant < 0) {
            // No real solution
            return null;
        }
    
        // Calculate both solutions
        const d1 = (-B + Math.sqrt(discriminant)) / (2 * A);
        const d2 = (-B - Math.sqrt(discriminant)) / (2 * A);
    
        return d1;
    }

    function calculateBeamShearBothAxes(shape, Dc, Cc, db, B, L, c, qu, fc, λ) {
        let results = {};
    
        if (shape === "square") {
            // Beam shear along x-axis for square beam
            let dx = Dc - Cc - 0.5 * db;
            let aax = (B - c - 2 * dx) / 2;
            let Vux = qu * B * aax;
            let ΦVnx =0.75* (1 / 6) * λ * Math.sqrt(fc) * B * dx;
    
            // Beam shear along y-axis for square beam
            let dy = Dc - Cc - 1.5 * db;
            let aay = (B - c - 2 * dy) / 2;
            let Vuy = qu * B * aay;
            let ΦVny =0.75* (1 / 6) * λ * Math.sqrt(fc) * B * dy;
    
            results = {
                xAxis: { d: dx, aa: aax, Vu: Vux, ΦVn: ΦVnx },
                yAxis: { d: dy, aa: aay, Vu: Vuy, ΦVn: ΦVny }
            };
    
        } else if (shape === "rectangular") {
            // Beam shear along the longer side (L) for rectangular beam
            let dLonger = Dc - Cc - 0.5 * db;
            let aaLonger = (L - c - 2 * dLonger) / 2;
            let VuLonger = qu * B * aaLonger;
            let ΦVnLonger = 0.75*(1 / 6) * λ * Math.sqrt(fc) * B * dLonger;
    
            // Beam shear along the shorter side (B) for rectangular beam
            let dShorter = Dc - Cc - 1.5 * db;
            let aaShorter = (B - c - 2 * dShorter) / 2;
            let VuShorter = qu * L * aaShorter;
            let ΦVnShorter =0.75 *(1 / 6) * λ * Math.sqrt(fc) * L * dShorter;
    
            results = {
                xAxis: { d: dLonger, aa: aaLonger, Vu: VuLonger, ΦVn: ΦVnLonger },
                yAxis: { d: dShorter, aa: aaShorter, Vu: VuShorter, ΦVn: ΦVnShorter }
            };
        } else {
            throw new Error("Invalid shape provided.");
        }
    
        return results;
    }

    function designRebars(B,L,Dc,Cc,db,diaBar, c, qu, fc, fy,num,beta ){
        console.log("d1");
        let b = B;
        let bp = L;
        let d = Dc - Cc - num * db;
        let aa = (bp*1000 - c)/2;
        let Mu = qu * b * (aa*aa/1000000)/2;
        //Check if SRRB
        let ct = 3*d/8;
        let test = (0.85 - ((0.05/7)*(fc-28)));
        console.log("d2");
        let beta1 = 0;
        if (fc<=28) {
            beta1 = 0.85;
            console.log("d3");
            
        } else if (0.65>=test) {
            beta1 = 0.65;
            console.log("d4");
        } else {
            beta1 = test;
            console.log("d5");
        }
        let at = beta1 * ct;
        console.log(beta1);
        let reductionFactor = 0.9;
        console.log("d7");
        let muMax = (reductionFactor * (0.85 * fc) * at * b*1000 * (d-(at/2)))/1000000;
        console.log("muMax: ",muMax);
        // compare Mu with muMax
        let SRRB ;
        if (Mu < muMax) {
            SRRB = true;
        } else {
            SRRB = false;
        }
        console.log("d8.5");
        console.log(SRRB);
        let Rn, rho, rhoMin1, rhoMin2, rhoMin, asMin, asMin1, asMin2, message, as1, as, ab, nInitial, nRounded;
        let sc, scMin, centerBand, nCenterBand, nCenterBandRounded,Ag;
        Ag = b*1000 *Dc;
        console.log("d8.7");
        if (SRRB == true) {
            Rn = (Mu*1000000)/(reductionFactor*b*1000*d*d);
            console.log(1-(2 *(Rn/(0.85*fc))));
            rho = 0.85 * (fc / fy) * (1 - Math.sqrt(1-(2 *(Rn/(0.85*fc)))));
            rhoMin1 = 1.4/fy;
            rhoMin2 = Math.sqrt(fc)/(4*fy);
            rhoMin = Math.min(rhoMin1, rhoMin2);
            if (rho < rhoMin) {
                rho = rhoMin;
            }
            console.log("rho: ", rho);
            as1 = rho * b*1000 * d;
            if (fy < 420){
            asMin = 0.002 * Ag
            asMin1 = 0;
            asMin2 = 0;
            } else {
            asMin1 = 0.0018 * 420 * Ag / fy;
            asMin2 = 0.0014*Ag;
            asMin = Math.min(asMin1, asMin2);
            }
            console.log("d10");
            if (as1 < asMin) {
                as1 = asMin;
            } 
            as = as1;
            console.log("d11");
            ab = Math.PI*diaBar*diaBar/4;
            nInitial = as / ab;
            nRounded = Math.ceil(nInitial);
            sc = ((b*1000)-(2*Cc)-(nRounded*diaBar))/(nRounded-1);
            scMin = Math.max(50, diaBar);
            console.log("d12");
            if (sc < scMin) {
                message = "Spacing Failed, Increase Dimension if Possible";
            } else {
                message = "Okay";
            }
            centerBand = 2 / (beta+1);
            nCenterBand = centerBand * nRounded;
            nCenterBandRounded = Math.ceil(nCenterBand);
        } else {
            console.log("DRRB");
        }
        return {b, bp, d, Ag,aa, Mu, ct, beta1, at, reductionFactor,num, muMax, SRRB, Rn, rho, rhoMin1, rhoMin2, rhoMin,as1, as, asMin, asMin1, asMin2, ab, nInitial, nRounded, sc, scMin, message, centerBand, nCenterBand, nCenterBandRounded} ;
    }
function createParagraph(content) {
    const p = document.createElement('p');
    p.innerHTML = content;
    return p;
}
function createHeader5(content) {
    const h5 = document.createElement('h5');
    h5.innerHTML = content;
    return h5;
}
function createHeader3(content) {
    const h3 = document.createElement('h3');
    h3.innerHTML = content;
    return h3;
}
function createDimension(dc, depth, soilBearingCapacity, unitWeightConcrete, unitWeightSoil, Dimension, liveLoad, deadLoad, clearCover, barDia, punchingShearVu, surcharge, columnWidth, λ, fc, dkk, dc1, dc2, Dimension1, punchingShearVu1,constraints) {
    const resultsContent = document.createElement('div');
    
    // Add each part of the content as a separate paragraph node
    resultsContent.appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
    resultsContent.appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
    resultsContent.appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
    resultsContent.appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${Dimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
    resultsContent.appendChild(createParagraph(`q<sub>net</sub> = ${Dimension.qnet} kPa`));
    resultsContent.appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
    resultsContent.appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${Dimension.P} kN / ${Dimension.qnet} kPa = ${Dimension.Af.toFixed(2)} m<sup>2</sup>`));
    if (constraints===2){
    resultsContent.appendChild(createParagraph(`BL = A<sub>f</sub> = ${Dimension.Af.toFixed(2)} m<sup>2</sup> / ${Dimension.limitLength.toFixed(2)} meters`));
    resultsContent.appendChild(createParagraph(`L = ${Dimension.B3.toFixed(2)}`));
    resultsContent.appendChild(createParagraph(`L ≈ ${Dimension.L} meters, B = ${Dimension.B4}`));
    resultsContent.appendChild(createParagraph(`${Dimension.L} meters ${Dimension.L > Dimension.limitLength ? '>' : '<'} ${Dimension.limitLength} meters`));
    resultsContent.appendChild(createParagraph(`Therefore, ${Dimension.B2 > Dimension.limitLength ? 'Rectangular Footing' : 'Square Footing'}`));
        
    } else if (constraints===1){
        resultsContent.appendChild(createParagraph(`BL = A<sub>f</sub> = ${Dimension.Af.toFixed(2)} m<sup>2</sup> = B(${Dimension.ratioLengthB/Dimension.ratioLengthL}B)`));
        resultsContent.appendChild(createParagraph(`B = ${Dimension.B3.toFixed(2)}`));
        resultsContent.appendChild(createParagraph(`B ≈ ${Dimension.B4} meters, L = (${Dimension.ratioLengthB} / ${Dimension.ratioLengthL}) x ${Dimension.B4} = ${Dimension.L} meters`));
    }
    return resultsContent;
}

function punchingShear(dc, depth, soilBearingCapacity, unitWeightConcrete, unitWeightSoil, Dimension, liveLoad, deadLoad, clearCover, barDia, punchingShearVu, surcharge, columnWidth, λ, fc, dkk, dc1, dc2, Dimension1, punchingShearVu1,constraints) {
    const resultsContent = document.createElement('div');
    
    // Add each part of the content as a separate paragraph node
    
    resultsContent.appendChild(createParagraph(`d (effective depth) = D<sub>c</sub> - C<sub>c</sub> - d<sub>b</sub> = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu.d} mm`));
    resultsContent.appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
    resultsContent.appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${Dimension.B4} x ${Dimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
    resultsContent.appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${Dimension.B4} meters x ${Dimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
    resultsContent.appendChild(createParagraph(`C + d = ${columnWidth} mm + ${punchingShearVu.d} mm = ${punchingShearVu.side} mm`));
    resultsContent.appendChild(createParagraph(`V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu.Pu.toFixed(2)} kN - ${punchingShearVu.qu.toFixed(2)} (${punchingShearVu.side / 1000} meter)<sup>2</sup> = ${punchingShearVu.Vu.toFixed(2)} kN`));
    resultsContent.appendChild(createParagraph(`ΦV<sub>n</sub> (Punching Shear) = 0.75 x 0.33 x λ x √f'c x 4 x (C + d) x d`));
    resultsContent.appendChild(createParagraph(`V<sub>u</sub> = ΦV<sub>n</sub>`));
    resultsContent.appendChild(createParagraph(`${(punchingShearVu.Vu * 1000).toFixed(2)} N = 0.75 x 0.33 x ${λ} x √${fc} x 4 x (${columnWidth} mm + d) x d`));
    resultsContent.appendChild(createParagraph(`d = ${dkk.toFixed(2)} mm`));
    resultsContent.appendChild(createParagraph(`D<sub>c</sub> = d + C<sub>c</sub> + d<sub>b</sub> = ${dkk.toFixed(2)} mm  + ${clearCover} mm + ${barDia} mm = ${dc1.toFixed(2)} mm ≈ ${dc2} mm`));
    resultsContent.appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc2} = ${depth - dc2} mm`));
    resultsContent.appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
    resultsContent.appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc2 / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${Dimension1.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
    resultsContent.appendChild(createParagraph(`q<sub>net</sub> = ${Dimension1.qnet} kPa`));
    resultsContent.appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${Dimension1.P} kN / ${Dimension1.qnet} kPa = ${Dimension1.Af.toFixed(2)} m<sup>2</sup>`));
    resultsContent.appendChild(createParagraph(`L = A<sub>f</sub>/B = ${Dimension1.Af.toFixed(3)} / ${Dimension1.limitLength.toFixed(3)} meters = ${Dimension1.B3}`));
    resultsContent.appendChild(createParagraph(`L ≈ ${Dimension1.L} meters`));
    
    return resultsContent;
}



// Example of appending the content to a parent element

function beamShear(dc2,clearCover,barDia,beamShearResult,Dimension1,columnWidth,punchingShearVu1,λ,fc ) {
    // Create a container for the results
    const resultsContent = document.createElement('div');
    // Populate the results with formatted content
    resultsContent.appendChild(createParagraph(`Shear Along Long Span:`));
    resultsContent.appendChild(createParagraph(`d = D<sub>c</sub> - C<sub>c</sub> - 0.5d<sub>b</sub> = ${dc2} mm - ${clearCover} mm - 0.5(${barDia} mm) = ${beamShearResult.xAxis.d} mm`));
    resultsContent.appendChild(createParagraph(`aa = (L - c - 2d) / 2 = (${Dimension1.L * 1000} mm - ${columnWidth} mm - 2(${beamShearResult.xAxis.d} mm)) / 2 = ${beamShearResult.xAxis.aa.toFixed(2)} mm`));
    resultsContent.appendChild(createParagraph(`V<sub>u</sub> = q<sub>u</sub> * B * aa = ${punchingShearVu1.qu.toFixed(2)} kPa * ${Dimension1.B4} m * ${beamShearResult.xAxis.aa / 1000} m = ${(beamShearResult.xAxis.Vu/1000000).toFixed(2)} kN`));
    resultsContent.appendChild(createParagraph(`ΦV<sub>n</sub> = (1/6) * λ * √f'c * B * d = (1/6) * ${λ} * √${fc} * ${Dimension1.B4 * 1000} mm * ${beamShearResult.xAxis.d} mm = ${(beamShearResult.xAxis.ΦVn/1000).toFixed(2)} kN `));
    resultsContent.appendChild(createParagraph(`Status: ${(beamShearResult.xAxis.Vu/1000000) > (beamShearResult.xAxis.ΦVn/1000) ? 'Failed' : 'Passed'}`));
    resultsContent.appendChild(createParagraph(`Shear Along Short Span:`));
    resultsContent.appendChild(createParagraph(`d = D<sub>c</sub> - C<sub>c</sub> - 1.5d<sub>b</sub> = ${dc2} mm - ${clearCover} mm - 1.5(${barDia} mm) = ${beamShearResult.yAxis.d} mm`));
    resultsContent.appendChild(createParagraph(`aa = (B - c - 2d) / 2 = (${Dimension1.B4 * 1000} mm - ${columnWidth} mm - 2(${beamShearResult.yAxis.d} mm)) / 2 = ${beamShearResult.yAxis.aa.toFixed(2)} mm`));
    resultsContent.appendChild(createParagraph(`V<sub>u</sub> = q<sub>u</sub> * L * aa = ${punchingShearVu1.qu.toFixed(2)} kPa * ${Dimension1.L} m * ${beamShearResult.yAxis.aa / 1000} m = ${(beamShearResult.yAxis.Vu/1000000).toFixed(2)} kN`));
    resultsContent.appendChild(createParagraph(`ΦV<sub>n</sub> = (1/6) * λ * √f'c * L * d = (1/6) * ${λ} * √${fc} * ${Dimension1.L * 1000} mm * ${beamShearResult.yAxis.d} mm = ${(beamShearResult.yAxis.ΦVn/1000).toFixed(2)} kN `));
    resultsContent.appendChild(createParagraph(`Status: ${(beamShearResult.yAxis.Vu/1000000) > (beamShearResult.yAxis.ΦVn/1000) ? 'Failed' : 'Passed'}`));
    
    return resultsContent;
}
function rebarDisplay(B,L,Dc,Cc,db,diaBar, c, qu, fc, fy, b, bp, d, aa, Mu, ct, beta, num, at, reductionFactor, muMax, SRRB, Rn, rho, rhoMin1, rhoMin2, rhoMin,as1, as, asMin, asMin1, asMin2, ab, nInitial, nRounded, sc, scMin, message, centerBand, nCenterBand, nCenterBandRounded, Ag,beta1){
    console.log("r1");
    const resultsContent = document.createElement('div');
    resultsContent.appendChild(createParagraph(`b = ${B} m`));
    resultsContent.appendChild(createParagraph(`bp = ${L} m`));
    resultsContent.appendChild(createParagraph(`d = D<sub>c</sub> - C<sub>c</sub> - ${num}d<sub>b</sub> = ${Dc} mm - ${Cc} mm - ${num}(${db} mm) = ${d} mm`));
    
        console.log("r2");
    resultsContent.appendChild(createParagraph(`aa = (bp - c) / 2 = (${bp*1000} mm - ${c} mm) / 2 = ${aa} mm`));
    resultsContent.appendChild(createParagraph(`Mu = q<sub>u</sub> x b x (aa<sup>2</sup>) / 2 = ${qu} kPa x ${B} m x (${aa/1000} m)<sup>2</sup> / 2 = ${(Mu).toFixed(2)} kNm`));
  
        console.log("r3");
    resultsContent.appendChild(createParagraph(`Check if SRRB`));
    resultsContent.appendChild(createParagraph(`ct = 3 x d / 8 = 3 x ${ d } / 8 = ${ct} mm`));
    resultsContent.appendChild(createParagraph(`β : 0.65 < 0.85-(0.05/7)*(fc-28) < 0.85`));
    resultsContent.appendChild(createParagraph(`β = ${beta1}`));
    resultsContent.appendChild(createParagraph(`at = β x ct = ${beta1} x ${ct} = ${at} mm`));
    resultsContent.appendChild(createParagraph(`Reduction Factor = 0.9`));
    resultsContent.appendChild(createParagraph(`Mu<sub>max</sub> = 0.85 x ${fc}MPa x ${at}mm x ${b*1000}mm x (${d}mm - (${at}mm / 2)) = ${(muMax).toFixed(2)} kNm`));
    resultsContent.appendChild(createParagraph(`Mu ${Mu > muMax ? `>`:`<`} Mu<sub>max</sub>`));
    resultsContent.appendChild(createParagraph(`SRRB: ${SRRB}`));
    resultsContent.appendChild(createParagraph(``));
    console.log("r4");
   
    if (SRRB == true) {
    
    resultsContent.appendChild(createParagraph(`R<sub>n</sub> = Mu / Φbd<sup>2</sup> = ${(Mu*1000000).toFixed(2)}Nmm / (${reductionFactor} x ${b*1000}mm x (${d}mm)<sup>2</sup>) = ${(Rn).toFixed(2)} MPa`));
    resultsContent.appendChild(createParagraph(`ρ = 0.85 x (fc / fy) x (1 - √(1 - (2 x R<sub>n</sub> / (0.85 x fc))))`)); 
    resultsContent.appendChild(createParagraph(`ρ = 0.85 x (${fc} / ${fy}) x (1 - √(1 - (2 x ${Rn} / (${fc} x 0.85)))) = ${rho.toFixed(6)}`));   
    resultsContent.appendChild(createParagraph(`ρ<sub>min1</sub> = 1.4 / fy = 1.4 / ${fy} = ${rhoMin1.toFixed(6)}`));  
    resultsContent.appendChild(createParagraph(`ρ<sub>min2</sub> = √(fc) / (4 x fy) = √${fc} / (4 x ${fy}) = ${rhoMin2.toFixed(6)}`));
    resultsContent.appendChild(createParagraph(`ρ<sub>min</sub> = ${rhoMin.toFixed(6)}`));
    resultsContent.appendChild(createParagraph(`ρ${rho < rhoMin ? `<`:`>`} ρ<sub>min</sub>`));
    resultsContent.appendChild(createParagraph(`as<sub>1</sub> = ρ x b x d = ${rho} x ${b*1000}mm x ${d}mm = ${as1.toFixed(2)}mm<sup>2</sup>`));
    resultsContent.appendChild(createParagraph(`fy ${fy < 420 ? `<`:`>`} 420`));
    resultsContent.appendChild(createParagraph(`Ag = b x Dc = ${b*1000}mm x ${Dc}mm = ${Ag}mm<sup>2</sup>`));
    if (fy < 420){
    resultsContent.appendChild(createParagraph(`as<sub>min</sub> = 0.002 x Ag = 0.002 x ${Ag} = ${asMin.toFixed(2)}`));
    
    } else {
    resultsContent.appendChild(createParagraph(`as<sub>min1</sub> = 0.0018 x 420 x Ag / fy = 0.0018 x 420 x ${Ag} / ${fy} = ${asMin1.toFixed(2)}mm<sup>2</sup>`));
    resultsContent.appendChild(createParagraph(`as<sub>min2</sub> = 0.0014 x Ag = 0.0014 x ${Ag} = ${asMin2.toFixed(2)}mm<sup>2</sup>`));
    resultsContent.appendChild(createParagraph(`as<sub>min</sub> = ${asMin.toFixed(2)}mm<sup>2</sup>`));
    }
    resultsContent.appendChild(createParagraph(`as<sub>1</sub> ${as1 < asMin ? `<`:`>`} as<sub>min</sub>`));
    resultsContent.appendChild(createParagraph(`as = ${as.toFixed(2)}mm<sup>2</sup>`));
    resultsContent.appendChild(createParagraph(`ab = π x d<sup>2</sup>/4 = π x (${diaBar}mm)<sup>2</sup>/4 =${ab.toFixed(2)}mm<sup>2</sup>`));
    resultsContent.appendChild(createParagraph(`n = as / ab = ${as} / ${ab} = ${nInitial.toFixed(2)}pcs ≈ ${nRounded}pcs `));
    resultsContent.appendChild(createParagraph(`sc = (b - 2Cc - ndb) / (n - 1) = (${b} - 2${Cc} - ${nRounded}x${diaBar}) / (${nRounded} - 1) = ${sc.toFixed(2)}mm`));
    resultsContent.appendChild(createParagraph(`sc<sub>min</sub> = least of (50mm , Bar Diameter, 4/3rd of dAgg) = ${scMin.toFixed(2)}mm`));
    resultsContent.appendChild(createParagraph(`sc ${sc < scMin ? `<`:`>`} sc<sub>min</sub>`));
    resultsContent.appendChild(createParagraph(`∴${message}.`));
    resultsContent.appendChild(createParagraph(`Centerband = 2 / β+1 = 2 / (${beta} + 1) = ${centerBand.toFixed(2)}`));
    resultsContent.appendChild(createParagraph(`n<sub>centerband</sub> = Centerband x n = ${centerBand} x ${nRounded} = ${nCenterBand} ≈ ${nCenterBandRounded} pcs`));
    }
    console.log("r7");
    return resultsContent;
}
 

    
    function displayPunchingShearResults2(dc, depth, soilBearingCapacity, unitWeightConcrete, unitWeightSoil, surcharge, liveLoad, deadLoad, punchingShearVu, columnWidth, squareDimension, squareDimension1, dkk, dc1, dc2, clearCover, barDia, λ,fc, beamShearResult,punchingShearVu1) {
        // Create a container for the results
        const resultsContent = document.createElement('div');
    
        // Populate the results with formatted content
        resultsContent.innerHTML = `
          <h3>Solution:</h3>
          <h5>Punching Shear Calculation</h5></li>
              <p>D<sub>c</sub> = ${dc} mm</p>
              <p>D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm</p>
              <p>q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q 
              <p>q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc/1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds/1000} m) - ${surcharge} kN/m<sup>2</sup></p>
              <p>q<sub>net</sub> = ${squareDimension.qnet} kPa</p>
              <p>P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN =${liveLoad+deadLoad} kN</p>
              <p>A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup></p>
              <p>B = √A<sub>f</sub> = √${squareDimension.Af.toFixed(2)} = ${squareDimension.B1.toFixed(2)} meters</p>
              <p>B ≈ ${squareDimension.B2} meters</p>
              <p>d (effective depth): D<sub>c</sub> - C<sub>c</sub> -d<sub>b</sub> = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu.d} mm</p>
              <p>P<sub>u</sub> (Ultimate Load): 1.2 Dead Load + 1.6 Live Load = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) ${punchingShearVu.Pu} kN</p>
              <p>q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu} kN / (${squareDimension.B2} meters)<sup>2</sup> = ${punchingShearVu.qu.toFixed(2)} kPa</p>
              <p>C + d = ${columnWidth} mm + ${punchingShearVu.d} mm = ${punchingShearVu.side} mm</p>
              <p>V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu.Pu} kN - ${punchingShearVu.qu} (${punchingShearVu.side/1000} meter)<sup>2</sup> = ${punchingShearVu.Vu.toFixed(2)} kN</p>
              <p>ΦV<sub>n</sub> (Punching Shear) = 0.75 x 0.33 x λ x √f'c x 4 x (C + d) x d
              <p>V<sub>u</sub> = ΦV<sub>n</sub></p>
              <p>${(punchingShearVu.Vu*1000).toFixed(2)} N = 0.75 x 0.33 x ${λ} x √${fc} x 4 x (${columnWidth} mm + d) x d </p>
              <p>d = ${dkk.toFixed(2)} mm </p>
              <p>D<sub>c</sub> = d + C<sub>c</sub> + d<sub>b</sub> = ${dkk.toFixed(2)} mm  + ${clearCover} mm + ${barDia} mm = ${dc1.toFixed(2)} mm ≈ ${dc2} mm</p>
              <p>D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc2} = ${depth - dc2} mm</p>
              <p>q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q 
              <p>q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc2/1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension1.ds/1000} m) - ${surcharge} kN/m<sup>2</sup></p>
              <p>q<sub>net</sub> = ${squareDimension1.qnet} kPa</p>
              <p>A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension1.P} kN / ${squareDimension1.qnet} kPa = ${squareDimension1.Af.toFixed(2)} m<sup>2</sup></p>
              <p>B = √A<sub>f</sub> = √${squareDimension1.Af.toFixed(3)} = ${squareDimension1.B1.toFixed(3)} meters</p>
              <p>B ≈ ${squareDimension1.B2} meters</p>
              <p>d (effective depth): D<sub>c</sub> - C<sub>c</sub> -d<sub>b</sub> = ${dc2} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu1.d} mm</p>
              <p>P<sub>u</sub> (Ultimate Load): 1.2 Dead Load + 1.6 Live Load = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) ${punchingShearVu1.Pu} kN</p>
              <p>q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu1.Pu} kN / (${squareDimension1.B2} meters)<sup>2</sup> = ${punchingShearVu1.qu.toFixed(2)} kPa</p>
              <p>C + d = ${columnWidth} mm + ${punchingShearVu1.d} mm = ${punchingShearVu1.side} mm</p>
              <p>V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu1.Pu} kN - ${punchingShearVu1.qu} (${punchingShearVu1.side/1000} meter)<sup>2</sup> = ${punchingShearVu1.Vu.toFixed(2)} kN</p>
              

              <h5>Beam Shear Calculation</h5>
    <p>Shear Along x-axis:</p>
    <p>d = D<sub>c</sub> - C<sub>c</sub> - 0.5d<sub>b</sub> = ${dc2} mm - ${clearCover} mm - 0.5(${barDia} mm) = ${beamShearResult.xAxis.d} mm</p>
    <p>aa = (B - c - 2d) / 2 = (${squareDimension1.B2 * 1000} mm - ${columnWidth} mm - 2(${beamShearResult.xAxis.d} mm)) / 2 = ${beamShearResult.xAxis.aa.toFixed(2)} mm</p>
    <p>V<sub>u</sub> = q<sub>u</sub> * B * aa = ${punchingShearVu1.qu.toFixed(2)} kPa * ${squareDimension1.B2} m * ${beamShearResult.xAxis.aa / 1000} m = ${(beamShearResult.xAxis.Vu/1000000).toFixed(2)} kN</p>
    <p>ΦV<sub>n</sub> = (1/6) * λ * √f'c * B * d = (1/6) * ${λ} * √${fc} * ${squareDimension1.B2 * 1000} mm * ${beamShearResult.xAxis.d} mm = ${(beamShearResult.xAxis.ΦVn/1000).toFixed(2)} kN</p>
    <p>Status: ${(beamShearResult.xAxis.Vu/1000000) > (beamShearResult.xAxis.ΦVn/1000) ? 'Failed' : 'Passed'}</p>
    <p>Shear Along y-axis:</p>
    <p>d = D<sub>c</sub> - C<sub>c</sub> - 1.5d<sub>b</sub> = ${dc2} mm - ${clearCover} mm - 1.5(${barDia} mm) = ${beamShearResult.yAxis.d} mm</p>
    <p>aa = (B - c - 2d) / 2 = (${squareDimension1.B2 * 1000} mm - ${columnWidth} mm - 2(${beamShearResult.yAxis.d} mm)) / 2 = ${beamShearResult.yAxis.aa.toFixed(2)} mm</p>
    <p>V<sub>u</sub> = q<sub>u</sub> * B * aa = ${punchingShearVu1.qu.toFixed(2)} kPa * ${squareDimension1.B2} m * ${beamShearResult.yAxis.aa / 1000} m = ${(beamShearResult.yAxis.Vu/1000000).toFixed(2)} kN</p>
    <p>ΦV<sub>n</sub> = (1/6) * λ * √f'c * B * d = (1/6) * ${λ} * √${fc} * ${squareDimension1.B2 * 1000} mm * ${beamShearResult.yAxis.d} mm = ${(beamShearResult.yAxis.ΦVn/1000).toFixed(2)} kN</p>
    <p>Status: ${(beamShearResult.yAxis.Vu/1000000) > (beamShearResult.yAxis.ΦVn/1000) ? 'Failed' : 'Passed'}</p>
    
          <h3>Summary:</h3>
          <ol>
            <li><p>Final Depth (D<sub>c</sub>) : ${Math.ceil(dc1/25)*25} mm</p></li>
            <li><p>B : ${squareDimension1.B2} meters </p></li>
            </ol>
        `;
    
        // Clear previous results if any
        const resultDiv = document.getElementById("result");
        resultDiv.innerHTML = '';
    
        // Append the new results
        resultDiv.appendChild(resultsContent);
    
        // Show save button
        document.getElementById('saveButton').style.display = 'block';
    
        return resultsContent;
    }

    function openTab(evt, tabName) {
        // Hide all tab content
        var tabContents = document.getElementsByClassName("tab-content");
        for (var i = 0; i < tabContents.length; i++) {
          tabContents[i].style.display = "none";
        }
      
        // Remove the active class from all buttons
        var tabButtons = document.getElementsByClassName("tab-button");
        for (var i = 0; i < tabButtons.length; i++) {
          tabButtons[i].className = tabButtons[i].className.replace(" active", "");
        }
      
        // Show the selected tab content and mark the button as active
        document.getElementById(tabName).style.display = "block";
        evt.currentTarget.className += " active";
      }
      
    
});
