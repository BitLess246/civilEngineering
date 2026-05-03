import { SaveFile } from './script.js';

document.addEventListener("DOMContentLoaded", () => {
    let resContent;
    let columnWidthX;
    let columnWidthY;
    let columnWidth;
    let columnWidth1;
    let Mdlx;
    let Mllx;
    let Mdly;
    let Mlly;
    let Mdlz;
    let Mllz;
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
            const columnShape = document.getElementById('columnShape').value;
            if ( columnShape === "rectangular" ){
                columnWidthX = parseInt(document.getElementById('ColumnWidthX').value); 
                columnWidthY = parseInt(document.getElementById('ColumnWidthY').value);
                console.log("defined Width");
            } else if ( columnShape === "square" ){
                columnWidth = parseInt(document.getElementById('ColumnWidth').value);
                console.log("defined Width");
            } else if ( columnShape === "circle" ){
                columnWidth1 = parseInt(document.getElementById('ColumnWidth').value);
                columnWidth = columnWidth1 * Math.sqrt(Math.PI/4);
                console.log("defined Width");
            }
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
            constraints = parseInt(document.getElementById('LengthRestriction').value);
            const centricity = document.getElementById('centricity').value;
            if ( centricity === "eccentric" ) {
                Mdlx = parseInt(document.getElementById('mdlx').value); 
                Mllx = parseInt(document.getElementById('mllx').value);
                Mdly = parseInt(document.getElementById('mdly').value); 
                Mlly = parseInt(document.getElementById('mlly').value);
               
                console.log(`Mdlx = `,Mdlx);
            }
            
            // Initialize default values
            console.log("initialize values");
            let v=1;
            let b=0;
            let dc = 250;
            let dc1 = 250;
            let dc2 = 250;
            const clearCover = 75;
            const solution = solutionMethod(method, type, columnShape);
            
            // Display the results

            let punchingshear, beamshear,rectangularDimension,rectangularDimension1,squareDimension,beamShearResult, squareDimension1 , punchingShearVu , punchingShearVu1 , punchingShearVn , totalIterations = 0, ddd = 0;
            const resultDiv = document.getElementById("result");
            resultDiv.innerHTML = ''; // Clear previous results
            const summaryDiv = document.getElementById("Summary");
            summaryDiv.innerHTML = ''; // Clear previous results

            console.log(`columnShape :`, columnShape);
            console.log(`centricity: ` , centricity);
            console.log(`solution: `, solution);
            if ( centricity === "eccentric") {

                if (solution === 111) {
                    // Logic for solution Eccentric Isolated Square Iteration Method


                } else if (solution === 121) {
                    // Logic for solution Eccentric Isolated Square Approximate Method
                } else if (solution === 211) {
                    // Logic for solution Eccentric Isolated Rectangular Iteration Method
                } else if (solution === 221) {
                    // Logic for solution Eccentric Isolated Rectangular Approximate Method
    
                    let dimension = calculateDimension(depth, dc, deadLoad, liveLoad, Mdlx, Mllx, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, ratioLengthB, ratioLengthL,limitLength, constraints); 
                    console.log(`Dimension : B4=${dimension.B4}, L=${dimension.L}, e=${dimension.e}`);
                    let e = eccentricity(deadLoad,liveLoad,Mdlx,Mllx);
                    console.log(`Eu = `,e.Eu);

                    //Dimension
                    document.getElementById('result').appendChild(createHeader3(`Solution:`));
                    document.getElementById('result').appendChild(createHeader5(`Dimension Calculation`));
                    document.getElementById('result').appendChild(createParagraph(`\\( \D_c = ${dc} mm\\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( \D_s = H - D_c = ${depth} - ${dc} = ${depth - dc} mm\\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( \q_{net} = q_a - \\gamma_c D_c - \\gamma_s D_s - q\\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( \q_{net} = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/ \m^{3} \\times ${dc / 1000} m) - (${unitWeightSoil} kN/m^{3} \\times ${dimension.ds / 1000} m) - ${surcharge} kN/m^{2}\\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( \q_{net} = ${dimension.qnet.toFixed(2)} kPa\\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( P = P_{LL} + P_{DL} = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN\\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( M = M_{LL} + M_{DL} = ${Mllx} kNm + ${Mdlx} kNm = ${Mllx+Mdlx} kNm\\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( e = \\frac{M}{P} = \\frac{${dimension.M} kNm}{${dimension.P} kN} = ${(dimension.e*1000).toFixed(2)} mm\\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\(q_{net} = \\frac{P}{B_{y}B_{x}} \\times [1 + (\\frac{6e}{B_{x}})]\\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( \\frac{${dimension.qnet.toFixed(2)}}{1000}\\) = (\\( \\frac{${dimension.P*1000}N}{${dimension.k.toFixed(4)}B_{x}^{2}}\\) ) x [1 + (\\( \\frac{6 \\times ${dimension.e}m}{B_x}\\))]`));
                    document.getElementById('result').appendChild(createParagraph(`\\( B_x = ${dimension.B3.toFixed(4)} m \\approx ${dimension.L} m\\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( B_y = ${dimension.B3.toFixed(4)} m \\times ${dimension.k.toFixed(4)} = ${dimension.B2.toFixed(4)} m \\approx ${dimension.B4} m \\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( P_{u1} = 1.4P_{DL} = 1.4(${deadLoad}) kN = ${1.4*deadLoad} kN \\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( P_{u2} = 1.2P_{DL} + 1.6P_{LL} = 1.2(${deadLoad}) kN + 1.6(${liveLoad}) kN = ${1.2*deadLoad+1.6*liveLoad} kN \\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( P_u = ${e.Pu} kN \\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( M_{u1} = 1.4M_{DL} = 1.4(${Mdlx}) kNm = ${1.4*Mdlx} kNm \\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( M_{u2} = 1.2M_{DL} + 1.6M_{LL} = 1.2(${Mdlx}) kNm + 1.6(${Mllx}) kNm = ${1.2*Mdlx+1.6*Mllx} kNm \\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( M_u = ${e.Mu} kNm \\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( e_u = \\frac{M_u}{P_u} = \\frac{${e.Mu} kNm}{${e.Pu} kNm}= ${(e.Eu*1000).toFixed(2)} mm  \\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( \\frac{B_{x}}{6} = \\frac{${dimension.L*1000} mm }{6} = ${((dimension.L*1000)/6).toFixed(2)} mm  \\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( e_u ${e.Eu < (dimension.L/6) ? "<" : ">"} \\frac{B_{x}}{6} \\)`));
                    document.getElementById('result').appendChild(createParagraph(`\\( \\therefore ${e.Eu < (dimension.L/6) ? "\\text{Case 2 - No Tension}" : "\\text{Case 1 - With Tension}"}  \\)`));
                    
                    //Punching Shear Test
                    document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation`));
                    
                    

                    


                    if (e.Eu < (dimension.L/6)){
                        console.log(`eu < Bx/6`);
                       let d = dc - clearCover - barDia;
                        let punchingShearTest = punchingShearWithMoment(e.Pu,dimension.L,dimension.B4,d,columnWidthX,columnWidthY,e.Eu,λ,fc);
                        dc = punchingShearTest.d2 + clearCover + barDia;
                        dc = Math.ceil(dc/25)*25;
                        let beamShearTest = beamShearWithMoment(dc, clearCover,barDia,punchingShearTest.ax,punchingShearTest.qua,dimension.L,dimension.B4,columnWidthX,λ,fc,columnWidthY);
                        document.getElementById('result').appendChild(createParagraph(`\\( d  = D_c - C_c - d_b = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${d} mm\\)`));
                        document.getElementById('result').appendChild(createParagraph(`\\( q_{uA}  = \\frac{P_u}{B_y\\times B_x}\\times(1 - \\frac{6\\times e_u}{B_X}) \\)`));
                        document.getElementById('result').appendChild(createParagraph(`\\( q_{uA}  = \\frac{${e.Pu} kN}{${dimension.L}m\\times ${dimension.B4}m}\\times(1 - \\frac{6\\times ${e.Eu.toFixed(6)}m}{${dimension.L}m}) = ${punchingShearTest.qua.toFixed(3)}kPa \\)`));
                        document.getElementById('result').appendChild(createParagraph(`\\( q_{uB}  = \\frac{${e.Pu} kN}{${dimension.L}m\\times ${dimension.B4}m}\\times(1 + \\frac{6\\times ${e.Eu.toFixed(6)}m}{${dimension.L}m}) = ${punchingShearTest.qub.toFixed(3)}kPa \\)`));
                        document.getElementById('result').appendChild(createParagraph(`\\( V_{u}  = ${punchingShearTest.Vu} \\)`));
                       
                        let punchingShear =  punchingShearAll(e.Pu,columnWidthX,columnWidthY,d,dimension.L,dimension.B4,λ,fc);
                    
                        document.getElementById('result').appendChild(createParagraph(`\\( d  = D_c - C_c - d_b = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${d} mm\\)`));
                        document.getElementById('result').appendChild(createParagraph(`\\( A_{o}  = (c_y + d) \\times (c_x + d) = (${columnWidthY}+ ${d}) \\times (${columnWidthX}+ ${d}) = ${punchingShear.ao}m\\)`));
                        document.getElementById('result').appendChild(createParagraph(`\\( V_u = P_u - P_u \\times\\frac{A_o}{A_f} = ${e.Pu} - ${e.Pu} \\times\\frac{${punchingShear.ao}m}{${punchingShear.af.toFixed(2)}m^2} = ${punchingShear.Vu.toFixed(3)}kN\\)`));
                        document.getElementById('result').appendChild(createParagraph(`\\( V_u = \\phi \\times \\frac{1}{3} \\times \\lambda \\times \\sqrt{fc'} \\times [(2 \\times (d + C_x))+(2 \\times (d + C_y))]\\times d\\)`));
                        document.getElementById('result').appendChild(createParagraph(`\\( ${punchingShear.Vu.toFixed(3)}kN = ${0.75} \\times \\frac{1}{3} \\times (${λ}) \\times \\sqrt{${fc}} \\times [(2 \\times (d + ${columnWidthX}))+(2 \\times (d + ${columnWidthY}))]\\times d\\)`));
                        document.getElementById('result').appendChild(createParagraph(`\\( d = ${punchingShear.d1.toFixed(2)}mm\\)`));
                        dc = punchingShear.d1 +clearCover+barDia;
                        document.getElementById('result').appendChild(createParagraph(`\\( D_c  = d + C_c + d_b = ${punchingShear.d1.toFixed(2)} mm + ${clearCover} mm + ${barDia} mm = ${dc.toFixed(2)} mm \\approx ${Math.ceil(dc/25)*25}mm\\)`));
                        dc =Math.ceil(dc/25)*25;
                        d = dc - clearCover - barDia;
                       // let beamShear = beamShearAll(columnWidthX+d,(dimension.L/2)+columnWidthX+d,-dimension.B4/2,dimension.B4/2,dimension.L*dimension.B4,dimension.B4,dimension.L,ultimate(Mdly,Mlly),ultimate(Mdlx,Mllx),ultimate(deadLoad,liveLoad));
                    }  else {
                      console.log(`eu > Bx/6`);
                    }
                }
            } else {
                    
                if (solution === 112) {
                    // Logic for solution Concentric Isolated Square - Iteration Method
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
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x ${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn1.toFixed(2)}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/β) x λ x √f'c x b<sub>o</sub> x d`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/1) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn2.toFixed(2)}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + a<sub>s</sub>d/b<sub>o</sub>) x λ x √f'c x b<sub>o</sub> x d`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + (${as}x${punchingShearVu.d})/${4*(punchingShearVu.d+columnWidth)}) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn3.toFixed(2)}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ${punchingShearVn.minVn.toFixed(2)}KN`));
                    const roundedMinVn = parseFloat(punchingShearVn.minVn.toFixed(2));
                    const roundedVu = parseFloat(punchingShearVu.Vu.toFixed(2));
                    
                    console.log("Comparing rounded values: minVn =", roundedMinVn, "Vu =", roundedVu);

                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> ${roundedMinVn < roundedVu ? "<" : ">"} V<sub>u</sub>`));

                    document.getElementById('result').appendChild(createParagraph(`∴ ${roundedMinVn < roundedVu ? "Failed" : "Passed"} `));
                    console.log(`${v} min Vn = `,punchingShearVn.minVn);
                    console.log(`${v} Vu = `,punchingShearVu.Vu); 





                    console.log("displayed first trial");
                
                    while (punchingShearVu.Vu > punchingShearVn.minVn) {
                        console.log("iterating");
                        dc += 25;
                        v+=1;
                        squareDimension = calculateDimensionSquare(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                        console.log("calculated dimension");
                        punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad, columnWidth, squareDimension.B2, squareDimension.B2,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                        console.log("calculated Vu");
                        
                        punchingShearVn = calculatePunchingShearVn(punchingShearVu.d, punchingShearVu.side, fc, λ, bRatio, as);
                        console.log("calculated Vn");
                        document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation Trial ${v}`));
                        
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
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x ${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn1.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/β) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/1) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn2.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + a<sub>s</sub>d/b<sub>o</sub>) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + (${as}x${punchingShearVu.d})/${4*(punchingShearVu.d+columnWidth)}) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn3.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ${punchingShearVn.minVn.toFixed(2)}KN`));
                        const roundedMinVn = parseFloat(punchingShearVn.minVn.toFixed(2));
                        const roundedVu = parseFloat(punchingShearVu.Vu.toFixed(2));
                        
                        console.log("Comparing rounded values: minVn =", roundedMinVn, "Vu =", roundedVu);

                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> ${roundedMinVn < roundedVu ? "<" : ">"} V<sub>u</sub>`));

                        document.getElementById('result').appendChild(createParagraph(`∴ ${roundedMinVn < roundedVu ? "Failed" : "Passed"} `));
                        console.log(`${v} min Vn = `,punchingShearVn.minVn);
                        console.log(`${v} Vu = `,punchingShearVu.Vu); 
                        
                    
                    }
                    dc1=dc;
                    console.log("ended iteration");
                    document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation`));
                    beamShearResult = calculateBeamShearBothAxes("square", dc, clearCover, barDia, squareDimension.B2 * 1000, squareDimension.B2 * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                    document.getElementById('result').appendChild(beamShear(dc,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                    
                    while((beamShearResult.xAxis.Vu/1000000) > (beamShearResult.xAxis.ΦVn/1000) || (beamShearResult.yAxis.Vu/1000000) > (beamShearResult.yAxis.ΦVn/1000)){
                        dc+=25;
                        b+=1;
                        squareDimension = calculateDimensionSquare(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                        console.log("calculated dimension");
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`B = √Af = √${squareDimension.Af} = ${squareDimension.B1.toFixed(2)} = ${squareDimension.B2}m`));
                        
                        document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Trial ${b}`));
                        beamShearResult = calculateBeamShearBothAxes("square", dc, clearCover, barDia, squareDimension.B2 * 1000, squareDimension.B2 * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                        document.getElementById('result').appendChild(beamShear(dc,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                    
                    }
                    if(dc===dc1){}else{
                        document.getElementById('result').appendChild(createHeader5(`Recalculate Beam Dimension With new Dc`));
                        squareDimension = calculateDimensionSquare(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                        console.log("calculated dimension");
                        punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad, columnWidth, squareDimension.B2, squareDimension.B2,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                        console.log("calculated Vu");
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`B = √Af = √${squareDimension.Af} = ${squareDimension.B1.toFixed(2)} = ${squareDimension.B2}m`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                    
                    }
                    let rebars = designRebars(squareDimension.B4,squareDimension.L,dc,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,0.5,1);
                    console.log("sc after init:",rebars.sc);
                    document.getElementById('result').appendChild(createHeader5(`Reinforcement Design Calculation`));
                    document.getElementById('result').appendChild(rebarDisplay(squareDimension.B4,squareDimension.L,dc,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,rebars.b,rebars.bp,rebars.d,rebars.aa,rebars.Mu,rebars.ct,1,rebars.num,rebars.at,rebars.reductionFactor,rebars.muMax,rebars.SRRB,rebars.Rn,rebars.rho,rebars.rhoMin1,rebars.rhoMin2,rebars.rhoMin,rebars.as1,rebars.as,rebars.asMin,rebars.asMin1,rebars.asMin2,rebars.ab,rebars.nInitial,rebars.nRounded,rebars.sc,rebars.scMin,rebars.message,rebars.centerBand,rebars.nCenterBand,rebars.nCenterBandRounded,rebars.Ag,rebars.beta1));
                    document.getElementById('Summary').appendChild(createHeader3(`Summary:`));
                
                    document.getElementById('Summary').appendChild(createParagraph(`Dc = ${dc}mm`));
                    document.getElementById('Summary').appendChild(createParagraph(`B = ${squareDimension.B4}m`));
                    document.getElementById('Summary').appendChild(createParagraph(`No. Rebars, Bothway = ${rebars.nRounded}pcs`));
                
                    } else if (solution === 122) {
                        //isolated square approximate dc
                        document.getElementById('result').appendChild(createHeader3(`Solution:`));
                        document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation`));
                    
                        squareDimension = calculateDimensionSquare(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                        console.log("calculated dimension");
                        punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad, columnWidth, squareDimension.B2, squareDimension.B2,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                        console.log("calculated Vu");
                    
                        ddd = solveForD(columnWidth, punchingShearVu.Vu, λ, fc);
                        dc1 = ddd+ clearCover +barDia;
                        dc2 = Math.ceil(dc1 / 25) * 25;
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
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ΦV<sub>c</sub> = Φ x (1/3) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> = 0.75 x (1/3) x λ x √f'c x 4 x (d + C) x d`));
                        document.getElementById('result').appendChild(createParagraph(`${(punchingShearVu.Pu*1000).toFixed(2)}N = 0.75 x (1/3) x ${λ} x √${fc} x 4 x (d + ${columnWidth}) x d`));
                        document.getElementById('result').appendChild(createParagraph(`d = ${ddd.toFixed(2)}mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = d + C<sub>c</sub> + d<sub>b</sub> = ${dc1.toFixed(2)}mm = ${dc2}mm`));
                        squareDimension = calculateDimensionSquare(depth, dc2, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                    
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc2} = ${depth - dc2} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc2 / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${(depth - dc2) / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`B = √Af = √${squareDimension.Af.toFixed(2)} = ${squareDimension.B1.toFixed(2)} = ${squareDimension.B2}m`));
                        
                        document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation`));
                        beamShearResult = calculateBeamShearBothAxes("square", dc, clearCover, barDia, squareDimension.B2 * 1000, squareDimension.B2 * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                        document.getElementById('result').appendChild(beamShear(dc,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                
                        while((beamShearResult.xAxis.Vu/1000000) > (beamShearResult.xAxis.ΦVn/1000) || (beamShearResult.yAxis.Vu/1000000) > (beamShearResult.yAxis.ΦVn/1000)){
                            dc2+=25;
                            b+=1;
                            squareDimension = calculateDimensionSquare(depth, dc2, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                            console.log("calculated dimension");
                            document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc2} mm`));
                            document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc2} = ${depth - dc2} mm`));
                            document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                            document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc2 / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                            document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                            document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                            document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                            document.getElementById('result').appendChild(createParagraph(`B = √Af = √${squareDimension.Af} = ${squareDimension.B1.toFixed(2)} = ${squareDimension.B2}m`));
                            
                            document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Trial ${b}`));
                            beamShearResult = calculateBeamShearBothAxes("square", dc2, clearCover, barDia, squareDimension.B2 * 1000, squareDimension.B2 * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                            document.getElementById('result').appendChild(beamShear(dc2,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                    
                    }
                    if(dc2===dc1){}else{
                        document.getElementById('result').appendChild(createHeader5(`Recalculate Beam Dimension With new Dc`));
                        squareDimension = calculateDimensionSquare(depth, dc2, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                        console.log("calculated dimension");
                        punchingShearVu = calculatePunchingShear(dc2, clearCover, barDia, deadLoad, liveLoad, columnWidth, squareDimension.B2, squareDimension.B2,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                        console.log("calculated Vu");
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc2} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc2} = ${depth - dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`B = √Af = √${squareDimension.Af} = ${squareDimension.B1.toFixed(2)} = ${squareDimension.B2}m`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                        
                    }
                    let rebars = designRebars(squareDimension.B4,squareDimension.L,dc2,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,0.5,1);
                    console.log("sc after init:",rebars.sc);
                    document.getElementById('result').appendChild(createHeader5(`Reinforcement Design Calculation`));
                    document.getElementById('result').appendChild(rebarDisplay(squareDimension.B4,squareDimension.L,dc2,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,rebars.b,rebars.bp,rebars.d,rebars.aa,rebars.Mu,rebars.ct,1,rebars.num,rebars.at,rebars.reductionFactor,rebars.muMax,rebars.SRRB,rebars.Rn,rebars.rho,rebars.rhoMin1,rebars.rhoMin2,rebars.rhoMin,rebars.as1,rebars.as,rebars.asMin,rebars.asMin1,rebars.asMin2,rebars.ab,rebars.nInitial,rebars.nRounded,rebars.sc,rebars.scMin,rebars.message,rebars.centerBand,rebars.nCenterBand,rebars.nCenterBandRounded,rebars.Ag,rebars.beta1));
                    document.getElementById('Summary').appendChild(createHeader3(`Summary:`));
                
                    document.getElementById('Summary').appendChild(createParagraph(`Dc = ${dc2}mm`));
                    document.getElementById('Summary').appendChild(createParagraph(`B = ${squareDimension.B4}m`));
                    document.getElementById('Summary').appendChild(createParagraph(`No. Rebars, Bothway = ${rebars.nRounded}pcs`));
                
                    

                } else if (solution === 212) {
                    //isolated rectangular iteration
                    squareDimension = calculateDimensionRectangular(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints);
                    let bRatio = squareDimension.L / squareDimension.B4;
                    punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad,  columnWidth, squareDimension.B4, squareDimension.L, unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                    let as = columnLoc(columnLocation);
                    punchingShearVn = calculatePunchingShearVn(punchingShearVu.d, punchingShearVu.side, fc, λ, bRatio, as);
                    document.getElementById('result').appendChild(createHeader3(`Solution:`));
                    document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation`));
                    document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                    document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet.toFixed(2)} kPa`));
                    document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                    document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet.toFixed(2)} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                    
                
                    if (constraints === 2) {
                    //limited base
                    document.getElementById('result').appendChild(createParagraph(`L = A<sub>f</sub> / B = ${squareDimension.Af.toFixed(2)} kN / ${limitLength} kPa = ${squareDimension.B3.toFixed(3)} m = ${squareDimension.L} m`));
                
                    document.getElementById('result').appendChild(createParagraph(`d (effective depth) = D<sub>c</sub> - C<sub>c</sub> - d<sub>b</sub> = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu.d} mm`));
                    document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                    document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                    document.getElementById('result').appendChild(createParagraph(`C + d = ${columnWidth} mm + ${punchingShearVu.d} mm = ${punchingShearVu.side} mm`));
                    document.getElementById('result').appendChild(createParagraph(`b<sub>o</sub> = 4 x (C + d) = 4 x (${columnWidth}mm + ${punchingShearVu.d}mm) = ${4*(punchingShearVu.d+columnWidth)}mm`));
                    document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu.Pu.toFixed(2)} kN - ${punchingShearVu.qu.toFixed(2)} (${punchingShearVu.side / 1000} meter)<sup>2</sup> = ${punchingShearVu.Vu.toFixed(2)} kN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x λ x √f'c x b<sub>o</sub> x d`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x ${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn1.toFixed(2)}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/β) x λ x √f'c x b<sub>o</sub> x d`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/1) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn2.toFixed(2)}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + a<sub>s</sub>d/b<sub>o</sub>) x λ x √f'c x b<sub>o</sub> x d`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + (${as}x${punchingShearVu.d})/${4*(punchingShearVu.d+columnWidth)}) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn3.toFixed(2)}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ${punchingShearVn.minVn.toFixed(2)}KN`));
                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> ${punchingShearVn.minVn.toFixed(2) < punchingShearVu.Vu.toFixed(2) ?">":"<" } V<sub>u</sub>`));
                    document.getElementById('result').appendChild(createParagraph(`∴ ${punchingShearVn.minVn.toFixed(2) < punchingShearVu.Vu.toFixed(2) ?"Passed":"Failed" } `));
                    console.log("409 min Vn = ",punchingShearVn.minVn);
                    console.log("409 Vu = ",punchingShearVu.Vu); 

                    while (punchingShearVu.Vu > punchingShearVn.minVn) {
                        console.log("iterating");
                        dc += 25;
                        v+=1;
                        squareDimension = calculateDimensionRectangular(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints);
                        console.log("calculated dimension");
                        punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad, columnWidth,squareDimension.B4 , squareDimension.L,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                        console.log("calculated Vu");
                        
                        punchingShearVn = calculatePunchingShearVn(punchingShearVu.d, punchingShearVu.side, fc, λ, bRatio, as);
                        console.log("calculated Vn");
                        document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation Trial ${v}`));
                        
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet.toFixed(2)} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet.toFixed(2)} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`L = A<sub>f</sub> / B = ${squareDimension.Af.toFixed(2)} kN / ${limitLength} kPa = ${squareDimension.B3.toFixed(3)} m = ${squareDimension.L} m`));
                        
                        
                    
                        document.getElementById('result').appendChild(createParagraph(`d (effective depth) = D<sub>c</sub> - C<sub>c</sub> - d<sub>b</sub> = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu.d} mm`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`C + d = ${columnWidth} mm + ${punchingShearVu.d} mm = ${punchingShearVu.side} mm`));
                        document.getElementById('result').appendChild(createParagraph(`b<sub>o</sub> = 4 x (C + d) = 4 x (${columnWidth}mm + ${punchingShearVu.d}mm) = ${4*(punchingShearVu.d+columnWidth)}mm`));
                        document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu.Pu.toFixed(2)} kN - ${punchingShearVu.qu.toFixed(2)} (${punchingShearVu.side / 1000} meter)<sup>2</sup> = ${punchingShearVu.Vu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x ${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn1.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/β) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/1) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn2.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + a<sub>s</sub>d/b<sub>o</sub>) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + (${as}x${punchingShearVu.d})/${4*(punchingShearVu.d+columnWidth)}) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn3.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ${punchingShearVn.minVn.toFixed(2)}KN`));
                        const roundedMinVn = parseFloat(punchingShearVn.minVn.toFixed(2));
                        const roundedVu = parseFloat(punchingShearVu.Vu.toFixed(2));

                        console.log("Comparing rounded values: minVn =", roundedMinVn, "Vu =", roundedVu);

                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> ${roundedMinVn < roundedVu ? "<" : ">"} V<sub>u</sub>`));

                        document.getElementById('result').appendChild(createParagraph(`∴ ${roundedMinVn < roundedVu ? "Failed" : "Passed"} `));
                        console.log(`${v} min Vn = `,punchingShearVn.minVn);
                        console.log(`${v} Vu = `,punchingShearVu.Vu); 
                    
                    }

                    dc1=dc;
                    console.log("ended iteration");
                    document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation`));
                    beamShearResult = calculateBeamShearBothAxes("square", dc, clearCover, barDia, squareDimension.B2 * 1000, squareDimension.B2 * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                    document.getElementById('result').appendChild(beamShear(dc,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                    
                    while((beamShearResult.xAxis.Vu/1000000) > (beamShearResult.xAxis.ΦVn/1000) || (beamShearResult.yAxis.Vu/1000000) > (beamShearResult.yAxis.ΦVn/1000)){
                        dc+=25;
                        b+=1;
                        squareDimension = calculateDimensionSquare(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                        console.log("calculated dimension");
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet.toFixed(2)} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`L = A<sub>f</sub> / B = ${squareDimension.Af.toFixed(2)} kN / ${limitLength} kPa = ${squareDimension.B3.toFixed(3)} m = ${squareDimension.L} m`));
                        
                        document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Trial ${b}`));
                        beamShearResult = calculateBeamShearBothAxes("square", dc, clearCover, barDia, squareDimension.B4 * 1000, squareDimension.L * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                        document.getElementById('result').appendChild(beamShear(dc,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                    
                    }
                    if(dc===dc1){}else{
                        document.getElementById('result').appendChild(createHeader5(`Recalculate Beam Dimension With new Dc`));
                        squareDimension = calculateDimensionSquare(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity);
                        console.log("calculated dimension");
                        punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad, columnWidth, squareDimension.B4, squareDimension.L,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                        console.log("calculated Vu");
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet.toFixed(2)} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`L = A<sub>f</sub> / B = ${squareDimension.Af.toFixed(2)} kN / ${limitLength} kPa = ${squareDimension.B3.toFixed(3)} m = ${squareDimension.L} m`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                    
                    }
                    let rebars = designRebars(squareDimension.B4,squareDimension.L,dc,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,0.5,bRatio);
                    console.log("sc after init:",rebars.sc);
                    document.getElementById('result').appendChild(createHeader5(`Reinforcement Design Calculation Along Long Span`));
                    document.getElementById('result').appendChild(rebarDisplay(squareDimension.B4,squareDimension.L,dc,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,rebars.b,rebars.bp,rebars.d,rebars.aa,rebars.Mu,rebars.ct,bRatio, rebars.num,rebars.at,rebars.reductionFactor,rebars.muMax,rebars.SRRB,rebars.Rn,rebars.rho,rebars.rhoMin1,rebars.rhoMin2,rebars.rhoMin,rebars.as1,rebars.as,rebars.asMin,rebars.asMin1,rebars.asMin2,rebars.ab,rebars.nInitial,rebars.nRounded,rebars.sc,rebars.scMin,rebars.message,rebars.centerBand,rebars.nCenterBand,rebars.nCenterBandRounded,rebars.Ag,rebars.beta1));
                    let rebars2 = designRebars(squareDimension.L,squareDimension.B4,dc,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,1.5,bRatio);
                    console.log("sc after init:",rebars.sc);
                    document.getElementById('result').appendChild(createHeader5(`Reinforcement Design Calculation Along Short Span`));
                    document.getElementById('result').appendChild(rebarDisplay(squareDimension.L,squareDimension.B4,dc,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,rebars2.b,rebars2.bp,rebars2.d,rebars2.aa,rebars2.Mu,rebars2.ct,bRatio, rebars2.num,rebars2.at,rebars2.reductionFactor,rebars2.muMax,rebars2.SRRB,rebars2.Rn,rebars2.rho,rebars2.rhoMin1,rebars2.rhoMin2,rebars2.rhoMin,rebars2.as1,rebars2.as,rebars2.asMin,rebars2.asMin1,rebars2.asMin2,rebars2.ab,rebars2.nInitial,rebars2.nRounded,rebars2.sc,rebars2.scMin,rebars2.message,rebars2.centerBand,rebars2.nCenterBand,rebars2.nCenterBandRounded,rebars2.Ag,rebars2.beta1));
                    document.getElementById('Summary').appendChild(createHeader3(`Summary:`));
                
                    document.getElementById('Summary').appendChild(createParagraph(`Dc = ${dc}mm`));
                    document.getElementById('Summary').appendChild(createParagraph(`B = ${squareDimension.B4}m`));
                    document.getElementById('Summary').appendChild(createParagraph(`L = ${squareDimension.L}m`));
                    
                    document.getElementById('Summary').appendChild(createParagraph(`No. Rebars= ${rebars.nRounded}pcs`));
                    document.getElementById('Summary').appendChild(createParagraph(`No. Rebars= ${rebars2.nRounded}pcs`));
                    

                    } else if (constraints === 1){
                        //ratio
                        document.getElementById('result').appendChild(createParagraph(`L = (${ratioLengthB}/${ratioLengthL})B `));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = BL = (${ratioLengthB}/${ratioLengthL})B<sup>2</sup> `));
                        document.getElementById('result').appendChild(createParagraph(`${squareDimension.Af.toFixed(2)}m<sup>2</sup> = BL = (${ratioLengthB}/${ratioLengthL})B<sup>2</sup> `));
                        
                        document.getElementById('result').appendChild(createParagraph(`B = ${squareDimension.B3.toFixed(2)}m = ${squareDimension.B4}m ; L = ${squareDimension.L}m`));
                    
                        
                        document.getElementById('result').appendChild(createParagraph(`d (effective depth) = D<sub>c</sub> - C<sub>c</sub> - d<sub>b</sub> = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu.d} mm`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`C + d = ${columnWidth} mm + ${punchingShearVu.d} mm = ${punchingShearVu.side} mm`));
                        document.getElementById('result').appendChild(createParagraph(`b<sub>o</sub> = 4 x (C + d) = 4 x (${columnWidth}mm + ${punchingShearVu.d}mm) = ${4*(punchingShearVu.d+columnWidth)}mm`));
                        document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu.Pu.toFixed(2)} kN - ${punchingShearVu.qu.toFixed(2)} (${punchingShearVu.side / 1000} meter)<sup>2</sup> = ${punchingShearVu.Vu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x ${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn1.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/β) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/1) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn2.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + a<sub>s</sub>d/b<sub>o</sub>) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + (${as}x${punchingShearVu.d})/${4*(punchingShearVu.d+columnWidth)}) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn3.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ${punchingShearVn.minVn.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> ${punchingShearVn.minVn.toFixed(2) > punchingShearVu.Vu.toFixed(2) ?">":"<" } V<sub>u</sub>`));
                        document.getElementById('result').appendChild(createParagraph(`∴ ${punchingShearVn.minVn.toFixed(2) > punchingShearVu.Vu.toFixed(2) ?"Passed":"Failed" } `));
                        const roundedMinVn = parseFloat(punchingShearVn.minVn.toFixed(2));
                        const roundedVu = parseFloat(punchingShearVu.Vu.toFixed(2));
                        console.log("Comparing rounded values: minVn =", roundedMinVn, "Vu =", roundedVu);

                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> ${roundedMinVn < roundedVu ? "<" : ">"} V<sub>u</sub>`));

                        document.getElementById('result').appendChild(createParagraph(`∴ ${roundedMinVn < roundedVu ? "Failed" : "Passed"} `));
                        console.log(`${v} min Vn = `,punchingShearVn.minVn);
                        console.log(`${v} Vu = `,punchingShearVu.Vu);  

                    while (punchingShearVu.Vu > punchingShearVn.minVn) {
                        console.log("iterating");
                        dc += 25;
                        v+=1;
                        squareDimension = calculateDimensionRectangular(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints);
                        console.log("calculated dimension");
                        punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad, columnWidth,squareDimension.B4 , squareDimension.L,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                        console.log("calculated Vu");
                        
                        punchingShearVn = calculatePunchingShearVn(punchingShearVu.d, punchingShearVu.side, fc, λ, bRatio, as);
                        console.log("calculated Vn");
                        document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation Trial ${v}`));
                        
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet.toFixed(2)} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet.toFixed(2)} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`L = (${ratioLengthB}/${ratioLengthL})B `));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = BL = (${ratioLengthB}/${ratioLengthL})B<sup>2</sup> `));
                        document.getElementById('result').appendChild(createParagraph(`${squareDimension.Af.toFixed(2)}m<sup>2</sup> = BL = (${ratioLengthB}/${ratioLengthL})B<sup>2</sup> `));
                        
                        document.getElementById('result').appendChild(createParagraph(`B = ${squareDimension.B3.toFixed(2)}m = ${squareDimension.B4}m ; L = ${squareDimension.L}m`));
                    
                        
                        document.getElementById('result').appendChild(createParagraph(`d (effective depth) = D<sub>c</sub> - C<sub>c</sub> - d<sub>b</sub> = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu.d} mm`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`C + d = ${columnWidth} mm + ${punchingShearVu.d} mm = ${punchingShearVu.side} mm`));
                        document.getElementById('result').appendChild(createParagraph(`b<sub>o</sub> = 4 x (C + d) = 4 x (${columnWidth}mm + ${punchingShearVu.d}mm) = ${4*(punchingShearVu.d+columnWidth)}mm`));
                        document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu.Pu.toFixed(2)} kN - ${punchingShearVu.qu.toFixed(2)} (${punchingShearVu.side / 1000} meter)<sup>2</sup> = ${punchingShearVu.Vu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n1</sub> (Punching Shear) = 0.75 x (1/3) x ${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn1.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/β) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n2</sub> (Punching Shear) = 0.75 x (1/6) x (1 + 2/1) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn2.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + a<sub>s</sub>d/b<sub>o</sub>) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n3</sub> (Punching Shear) = 0.75 x (1/12) x (2 + (${as}x${punchingShearVu.d})/${4*(punchingShearVu.d+columnWidth)}) x${λ} x √${fc}MPa x ${4*(punchingShearVu.d+columnWidth)}mm x ${punchingShearVu.d}mm = ${punchingShearVn.Vn3.toFixed(2)}KN`));
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ${punchingShearVn.minVn.toFixed(2)}KN`));
                        const roundedMinVn = parseFloat(punchingShearVn.minVn.toFixed(2));
                        const roundedVu = parseFloat(punchingShearVu.Vu.toFixed(2));
                        console.log("Comparing rounded values: minVn =", roundedMinVn, "Vu =", roundedVu);

                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> ${roundedMinVn < roundedVu ? "<" : ">"} V<sub>u</sub>`));

                        document.getElementById('result').appendChild(createParagraph(`∴ ${roundedMinVn < roundedVu ? "Failed" : "Passed"} `));
                        console.log(`${v} min Vn = `,punchingShearVn.minVn);
                        console.log(`${v} Vu = `,punchingShearVu.Vu); 
                    
                    }

                    dc1=dc;
                    console.log("ended iteration");
                    document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation`));
                    beamShearResult = calculateBeamShearBothAxes("square", dc, clearCover, barDia, squareDimension.B2 * 1000, squareDimension.B2 * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                    document.getElementById('result').appendChild(beamShear(dc,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                    
                    while((beamShearResult.xAxis.Vu/1000000) > (beamShearResult.xAxis.ΦVn/1000) || (beamShearResult.yAxis.Vu/1000000) > (beamShearResult.yAxis.ΦVn/1000)){
                        dc+=25;
                        b+=1;
                        squareDimension = calculateDimensionRectangular(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints);
                        console.log("calculated dimension");
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`L = (${ratioLengthB}/${ratioLengthL})B `));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = BL = (${ratioLengthB}/${ratioLengthL})B<sup>2</sup> `));
                        document.getElementById('result').appendChild(createParagraph(`${squareDimension.Af.toFixed(2)}m<sup>2</sup> = BL = (${ratioLengthB}/${ratioLengthL})B<sup>2</sup> `));
                        
                        document.getElementById('result').appendChild(createParagraph(`B = ${squareDimension.B3.toFixed(2)}m = ${squareDimension.B4}m ; L = ${squareDimension.L}m`));
                    
                        document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Trial ${b}`));
                        beamShearResult = calculateBeamShearBothAxes("square", dc, clearCover, barDia, squareDimension.B2 * 1000, squareDimension.B2 * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                        document.getElementById('result').appendChild(beamShear(dc,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                    
                    }
                    if(dc===dc1){}else{
                        document.getElementById('result').appendChild(createHeader5(`Recalculate Beam Dimension With new Dc`));
                        squareDimension = calculateDimensionRectangular(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints);
                        console.log("calculated dimension");
                        punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad, columnWidth, squareDimension.B2, squareDimension.B2,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                        console.log("calculated Vu");
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`L = (${ratioLengthB}/${ratioLengthL})B `));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = BL = (${ratioLengthB}/${ratioLengthL})B<sup>2</sup> `));
                        document.getElementById('result').appendChild(createParagraph(`${squareDimension.Af.toFixed(2)}m<sup>2</sup> = BL = (${ratioLengthB}/${ratioLengthL})B<sup>2</sup> `));
                        
                        document.getElementById('result').appendChild(createParagraph(`B = ${squareDimension.B3.toFixed(2)}m = ${squareDimension.B4}m ; L = ${squareDimension.L}m`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                    
                    }
                    let rebars = designRebars(squareDimension.B4,squareDimension.L,dc,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,0.5,bRatio);
                    console.log("sc after init:",rebars.sc);
                    document.getElementById('result').appendChild(createHeader5(`Reinforcement Design Calculation Along Long Span`));
                    document.getElementById('result').appendChild(rebarDisplay(squareDimension.B4,squareDimension.L,dc,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,rebars.b,rebars.bp,rebars.d,rebars.aa,rebars.Mu,rebars.ct,bRatio, rebars.num,rebars.at,rebars.reductionFactor,rebars.muMax,rebars.SRRB,rebars.Rn,rebars.rho,rebars.rhoMin1,rebars.rhoMin2,rebars.rhoMin,rebars.as1,rebars.as,rebars.asMin,rebars.asMin1,rebars.asMin2,rebars.ab,rebars.nInitial,rebars.nRounded,rebars.sc,rebars.scMin,rebars.message,rebars.centerBand,rebars.nCenterBand,rebars.nCenterBandRounded,rebars.Ag,rebars.beta1));
                    let rebars2 = designRebars(squareDimension.L,squareDimension.B4,dc,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,1.5,bRatio);
                    console.log("sc after init:",rebars.sc);
                    document.getElementById('result').appendChild(createHeader5(`Reinforcement Design Calculation Along Short Span`));
                    document.getElementById('result').appendChild(rebarDisplay(squareDimension.L,squareDimension.B4,dc,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,rebars2.b,rebars2.bp,rebars2.d,rebars2.aa,rebars2.Mu,rebars2.ct,bRatio, rebars2.num,rebars2.at,rebars2.reductionFactor,rebars2.muMax,rebars2.SRRB,rebars2.Rn,rebars2.rho,rebars2.rhoMin1,rebars2.rhoMin2,rebars2.rhoMin,rebars2.as1,rebars2.as,rebars2.asMin,rebars2.asMin1,rebars2.asMin2,rebars2.ab,rebars2.nInitial,rebars2.nRounded,rebars2.sc,rebars2.scMin,rebars2.message,rebars2.centerBand,rebars2.nCenterBand,rebars2.nCenterBandRounded,rebars2.Ag,rebars2.beta1));
                    document.getElementById('Summary').appendChild(createHeader3(`Summary:`));
                
                    document.getElementById('Summary').appendChild(createParagraph(`Dc = ${dc}mm`));
                    document.getElementById('Summary').appendChild(createParagraph(`B = ${squareDimension.B4}m`));
                    document.getElementById('Summary').appendChild(createParagraph(`L = ${squareDimension.L}m`));
                    
                    document.getElementById('Summary').appendChild(createParagraph(`No. Rebars= ${rebars.nRounded}pcs`));
                    document.getElementById('Summary').appendChild(createParagraph(`No. Rebars= ${rebars2.nRounded}pcs`));
                    

                    }        
                    
                
                    

                
                } else if (solution === 222) {
                    //isolated rectangular approximate dc
                    squareDimension = calculateDimensionRectangular(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints);
                    let bRatio = squareDimension.L / squareDimension.B4;
                    punchingShearVu = calculatePunchingShear(dc, clearCover, barDia, deadLoad, liveLoad,  columnWidth, squareDimension.B4, squareDimension.L, unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                    let as = columnLoc(columnLocation);

                    punchingShearVn = calculatePunchingShearVn(punchingShearVu.d, punchingShearVu.side, fc, λ, bRatio, as);
                    
                    ddd = solveForD(columnWidth, punchingShearVu.Vu, λ, fc);
                    dc1 = ddd+ clearCover +barDia;
                    dc2 = Math.ceil(dc1 / 25) * 25;

                    document.getElementById('result').appendChild(createHeader3(`Solution:`));
                    document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation`));
                    document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc} mm`));
                    document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc} = ${depth - dc} mm`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet.toFixed(2)} kPa`));
                    document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                    document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet.toFixed(2)} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                    
                
                    if (constraints === 2) {
                        //limited base
                    document.getElementById('result').appendChild(createParagraph(`L = A<sub>f</sub> / B = ${squareDimension.Af.toFixed(2)} kN / ${limitLength} kPa = ${squareDimension.B3.toFixed(3)} m = ${squareDimension.L} m`));
                
                    document.getElementById('result').appendChild(createParagraph(`d (effective depth) = D<sub>c</sub> - C<sub>c</sub> - d<sub>b</sub> = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu.d} mm`));
                    document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                    document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                    document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                    document.getElementById('result').appendChild(createParagraph(`C + d = ${columnWidth} mm + ${punchingShearVu.d} mm = ${punchingShearVu.side} mm`));
                    document.getElementById('result').appendChild(createParagraph(`b<sub>o</sub> = 4 x (C + d) = 4 x (${columnWidth}mm + ${punchingShearVu.d}mm) = ${4*(punchingShearVu.d+columnWidth)}mm`));
                    document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu.Pu.toFixed(2)} kN - ${punchingShearVu.qu.toFixed(2)} (${punchingShearVu.side / 1000} meter)<sup>2</sup> = ${punchingShearVu.Vu.toFixed(2)} kN`));

                    document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ΦV<sub>c</sub> = Φ x (1/3) x λ x √f'c x b<sub>o</sub> x d`));
                    document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> = 0.75 x (1/3) x λ x √f'c x 4 x (d + C) x d`));
                    document.getElementById('result').appendChild(createParagraph(`${(punchingShearVu.Pu*1000).toFixed(2)}N = 0.75 x (1/3) x ${λ} x √${fc} x 4 x (d + ${columnWidth}) x d`));
                    document.getElementById('result').appendChild(createParagraph(`d = ${ddd.toFixed(2)}mm `));
                    document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = d + C<sub>c</sub> + d<sub>b</sub> = ${ddd.toFixed(2)}mm + ${clearCover}mm + ${barDia}mm = ${dc1.toFixed(2)}mm = ${dc2}mm `));

                    document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation`));
                    beamShearResult = calculateBeamShearBothAxes("square", dc2, clearCover, barDia, squareDimension.B4 * 1000, squareDimension.L * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                    document.getElementById('result').appendChild(beamShear(dc2,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                    
                    while((beamShearResult.xAxis.Vu/1000000) > (beamShearResult.xAxis.ΦVn/1000) || (beamShearResult.yAxis.Vu/1000000) > (beamShearResult.yAxis.ΦVn/1000)){
                        dc2+=25;
                        b+=1;
                        squareDimension = calculateDimensionRectangular(depth, dc2, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints);
                        console.log("calculated dimension");
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc2} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc2} = ${depth - dc2} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc2 / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`L = A<sub>f</sub> / B = ${squareDimension.Af.toFixed(2)} kN / ${limitLength} kPa = ${squareDimension.B3.toFixed(3)} m = ${squareDimension.L} m`));
                
                    
                        document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Trial ${b}`));
                        beamShearResult = calculateBeamShearBothAxes("square", dc2, clearCover, barDia, squareDimension.B4 * 1000, squareDimension.L * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                        document.getElementById('result').appendChild(beamShear(dc2,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                    
                    }
                    if(dc===dc2){

                    }else{
                        document.getElementById('result').appendChild(createHeader5(`Recalculate Beam Dimension With new Dc`));
                        squareDimension = calculateDimensionRectangular(depth, dc2, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints);
                        console.log("calculated dimension");
                        punchingShearVu = calculatePunchingShear(dc2, clearCover, barDia, deadLoad, liveLoad, columnWidth, squareDimension.B4, squareDimension.L,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                        console.log("calculated Vu");
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc2} mm`));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc2} = ${depth - dc2} mm`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc2 / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                        document.getElementById('result').appendChild(createParagraph(`L = A<sub>f</sub> / B = ${squareDimension.Af.toFixed(2)} kN / ${limitLength} kPa = ${squareDimension.B3.toFixed(3)} m = ${squareDimension.L} m`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                    
                    
                    }

                    let rebars = designRebars(squareDimension.B4,squareDimension.L,dc2,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,0.5,bRatio);
                    console.log("sc after init:",rebars.sc);
                    document.getElementById('result').appendChild(createHeader5(`Reinforcement Design Calculation`));
                    document.getElementById('result').appendChild(rebarDisplay(squareDimension.B4,squareDimension.L,dc2,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,rebars.b,rebars.bp,rebars.d,rebars.aa,rebars.Mu,rebars.ct, bRatio, rebars.num, rebars.at, rebars.reductionFactor,rebars.muMax,rebars.SRRB,rebars.Rn,rebars.rho,rebars.rhoMin1,rebars.rhoMin2,rebars.rhoMin,rebars.as1,rebars.as,rebars.asMin,rebars.asMin1, rebars.asMin2, rebars.ab,  rebars.nInitial, rebars.nRounded, rebars.sc, rebars.scMin, rebars.message, rebars.centerBand, rebars.nCenterBand, rebars.nCenterBandRounded,rebars.Ag,rebars.beta1));
                    let rebars2 = designRebars(squareDimension.L,squareDimension.B4,dc2,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,1.5,bRatio);
                    console.log("sc after init:",rebars2.sc);
                    document.getElementById('result').appendChild(createHeader5(`Reinforcement Design Calculation`));
                    document.getElementById('result').appendChild(rebarDisplay(squareDimension.L,squareDimension.B4,dc2, clearCover, barDia, barDia,columnWidth, punchingShearVu.qu,fc,fy, rebars2.b,rebars2.bp,rebars2.d,rebars2.aa, rebars2.Mu,rebars2.ct, bRatio, rebars2.num,rebars2.at,rebars2.reductionFactor,rebars2.muMax, rebars2.SRRB,rebars2.Rn, rebars2.rho,rebars2.rhoMin1,rebars2.rhoMin2,rebars2.rhoMin, rebars2.as1,rebars2.as,rebars2.asMin,rebars2.asMin1,rebars2.asMin2,rebars2.ab, rebars2.nInitial,rebars2.nRounded, rebars2.sc,rebars2.scMin,rebars2.message,rebars2.centerBand,rebars2.nCenterBand,rebars2.nCenterBandRounded,rebars2.Ag, rebars2.beta1));
                    document.getElementById('Summary').appendChild(createHeader3(`Summary:`));
                
                    document.getElementById('Summary').appendChild(createParagraph(`Dc = ${dc2}mm`));
                    document.getElementById('Summary').appendChild(createParagraph(`B = ${squareDimension.B4}m`));
                    document.getElementById('Summary').appendChild(createParagraph(`L = ${squareDimension.L}m`));
                    
                    document.getElementById('Summary').appendChild(createParagraph(`No. Rebars= ${rebars.nRounded}pcs`));
                    document.getElementById('Summary').appendChild(createParagraph(`No. Rebars= ${rebars2.nRounded}pcs`));
                    
        


                    } else if (constraints === 1){
                        //ratio
                        document.getElementById('result').appendChild(createParagraph(`L = (${ratioLengthB}/${ratioLengthL})B `));
                        document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = BL = (${ratioLengthB}/${ratioLengthL})B<sup>2</sup> `));
                        document.getElementById('result').appendChild(createParagraph(`${squareDimension.Af.toFixed(2)}m<sup>2</sup> = BL = (${ratioLengthB}/${ratioLengthL})B<sup>2</sup> `));
                        
                        document.getElementById('result').appendChild(createParagraph(`B = ${squareDimension.B3.toFixed(2)}m = ${squareDimension.B4}m ; L = ${squareDimension.L}m`));
                        document.getElementById('result').appendChild(createParagraph(`d (effective depth) = D<sub>c</sub> - C<sub>c</sub> - d<sub>b</sub> = ${dc} mm - ${clearCover} mm - ${barDia} mm = ${punchingShearVu.d} mm`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                        document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                        document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                        document.getElementById('result').appendChild(createParagraph(`C + d = ${columnWidth} mm + ${punchingShearVu.d} mm = ${punchingShearVu.side} mm`));
                        document.getElementById('result').appendChild(createParagraph(`b<sub>o</sub> = 4 x (C + d) = 4 x (${columnWidth}mm + ${punchingShearVu.d}mm) = ${4*(punchingShearVu.d+columnWidth)}mm`));
                        document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> (Punching Shear) = P<sub>u</sub> - q<sub>u</sub>(C + d)<sup>2</sup> = ${punchingShearVu.Pu.toFixed(2)} kN - ${punchingShearVu.qu.toFixed(2)} (${punchingShearVu.side / 1000} meter)<sup>2</sup> = ${punchingShearVu.Vu.toFixed(2)} kN`));
        
                        document.getElementById('result').appendChild(createParagraph(`ΦV<sub>n</sub> = ΦV<sub>c</sub> = Φ x (1/3) x λ x √f'c x b<sub>o</sub> x d`));
                        document.getElementById('result').appendChild(createParagraph(`V<sub>u</sub> = 0.75 x (1/3) x λ x √f'c x 4 x (d + C) x d`));
                        document.getElementById('result').appendChild(createParagraph(`${(punchingShearVu.Pu*1000).toFixed(2)}N = 0.75 x (1/3) x ${λ} x √${fc} x 4 x (d + ${columnWidth}) x d`));
                        document.getElementById('result').appendChild(createParagraph(`d = ${ddd.toFixed(2)}mm `));
                        document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = d + C<sub>c</sub> + d<sub>b</sub> = ${ddd.toFixed(2)}mm + ${clearCover}mm + ${barDia}mm = ${dc1.toFixed(2)}mm = ${dc2}mm `));
        
                        document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation`));
                        beamShearResult = calculateBeamShearBothAxes("square", dc2, clearCover, barDia, squareDimension.B4 * 1000, squareDimension.L * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                        document.getElementById('result').appendChild(beamShear(dc2,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                        while((beamShearResult.xAxis.Vu/1000000) > (beamShearResult.xAxis.ΦVn/1000) || (beamShearResult.yAxis.Vu/1000000) > (beamShearResult.yAxis.ΦVn/1000)){
                            dc2+=25;
                            b+=1;
                            squareDimension = calculateDimensionRectangular(depth, dc2, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints);
                            console.log("calculated dimension");
                            document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc2} mm`));
                            document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc2} = ${depth - dc2} mm`));
                            document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                            document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc2 / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                            document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                            document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                            document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                            document.getElementById('result').appendChild(createParagraph(`L = A<sub>f</sub> / B = ${squareDimension.Af.toFixed(2)} kN / ${limitLength} kPa = ${squareDimension.B3.toFixed(3)} m = ${squareDimension.L} m`));
                    
                        
                            document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Trial ${b}`));
                            beamShearResult = calculateBeamShearBothAxes("square", dc2, clearCover, barDia, squareDimension.B4 * 1000, squareDimension.L * 1000, columnWidth, punchingShearVu.qu, fc, λ);
                            document.getElementById('result').appendChild(beamShear(dc2,clearCover,barDia,beamShearResult,squareDimension,columnWidth,punchingShearVu,λ,fc));
                        
                        }
                        if(dc===dc2){}else{
                            document.getElementById('result').appendChild(createHeader5(`Recalculate Beam Dimension With new Dc`));
                            squareDimension = calculateDimensionRectangular(depth, dc2, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints);
                            console.log("calculated dimension");
                            punchingShearVu = calculatePunchingShear(dc2, clearCover, barDia, deadLoad, liveLoad, columnWidth, squareDimension.B4, squareDimension.L,unitWeightSoil, unitWeightConcrete, surcharge,squareDimension.ds);
                            console.log("calculated Vu");
                            document.getElementById('result').appendChild(createParagraph(`D<sub>c</sub> = ${dc2} mm`));
                            document.getElementById('result').appendChild(createParagraph(`D<sub>s</sub> = H - D<sub>c</sub> = ${depth} - ${dc2} = ${depth - dc2} mm`));
                            document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = q<sub>a</sub> - γ<sub>c</sub> D<sub>c</sub> - γ<sub>s</sub> D<sub>s</sub> - q`));
                            document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${soilBearingCapacity} kPa - (${unitWeightConcrete} kN/m<sup>3</sup> x ${dc2 / 1000} m) - (${unitWeightSoil} kN/m<sup>3</sup> x ${squareDimension.ds / 1000} m) - ${surcharge} kN/m<sup>2</sup>`));
                            document.getElementById('result').appendChild(createParagraph(`q<sub>net</sub> = ${squareDimension.qnet} kPa`));
                            document.getElementById('result').appendChild(createParagraph(`P = Live Load + Dead Load = ${liveLoad} kN + ${deadLoad} kN = ${liveLoad + deadLoad} kN`));
                            document.getElementById('result').appendChild(createParagraph(`A<sub>f</sub> = P / q<sub>net</sub> = ${squareDimension.P} kN / ${squareDimension.qnet} kPa = ${squareDimension.Af.toFixed(2)} m<sup>2</sup>`));
                            document.getElementById('result').appendChild(createParagraph(`L = A<sub>f</sub> / B = ${squareDimension.Af.toFixed(2)} kN / ${limitLength} kPa = ${squareDimension.B3.toFixed(3)} m = ${squareDimension.L} m`));
                            document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2 Dead Load + 1.6 Live Load + 1.2 [(γ<sub>s</sub> x d<sub>s</sub>) + (γ<sub>c</sub> x d<sub>c</sub>) + q ] x B x L`));
                            document.getElementById('result').appendChild(createParagraph(`P<sub>u</sub> (Ultimate Load) = 1.2(${deadLoad} kN) + 1.6(${liveLoad} kN) + 1.2 [( ${unitWeightSoil} x ${(depth - dc) / 1000} ) + ( ${unitWeightConcrete} x ${dc / 1000} ) + ${surcharge} ] x ${squareDimension.B4} x ${squareDimension.L} = ${punchingShearVu.Pu.toFixed(2)} kN`));
                            document.getElementById('result').appendChild(createParagraph(`q<sub>u</sub> (Ultimate Bearing Pressure): P<sub>u</sub> / A<sub>f</sub> = ${punchingShearVu.Pu.toFixed(2)} kN / (${squareDimension.B4} meters x ${squareDimension.L} meters) = ${punchingShearVu.qu.toFixed(2)} kPa`));
                        
                        
                        }
                        let rebars = designRebars(squareDimension.B4,squareDimension.L,dc2,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,0.5,bRatio);
                        console.log("sc after init:",rebars.sc);
                        document.getElementById('result').appendChild(createHeader5(`Reinforcement Design Calculation Along Long Span`));
                        document.getElementById('result').appendChild(rebarDisplay(squareDimension.B4,squareDimension.L, dc2,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,rebars.b,rebars.bp,rebars.d,rebars.aa,rebars.Mu,rebars.ct,bRatio, rebars.num, rebars.at,rebars.reductionFactor,rebars.muMax,rebars.SRRB,rebars.Rn,rebars.rho,rebars.rhoMin1,rebars.rhoMin2,rebars.rhoMin,rebars.as1,rebars.as,rebars.asMin, rebars.asMin1,rebars.asMin2,rebars.ab,rebars.nInitial,rebars.nRounded,rebars.sc,rebars.scMin,rebars.message,rebars.centerBand,rebars.nCenterBand,rebars.nCenterBandRounded,rebars.Ag,rebars.beta1));
                        
                        let rebars2 = designRebars(squareDimension.L,squareDimension.B4,dc2,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,1.5,bRatio);
                        console.log("sc after init:",rebars.sc);
                        document.getElementById('result').appendChild(createHeader5(`Reinforcement Design Calculation Along Short Span`));
                        document.getElementById('result').appendChild(rebarDisplay(squareDimension.L,squareDimension.B4,dc2,clearCover,barDia,barDia,columnWidth,punchingShearVu.qu,fc,fy,rebars2.b,rebars2.bp,rebars2.d,rebars2.aa,rebars2.Mu,rebars2.ct,bRatio,rebars2.num,rebars2.at,rebars2.reductionFactor,rebars2.muMax,rebars2.SRRB,rebars2.Rn,rebars2.rho,rebars2.rhoMin1,rebars2.rhoMin2,rebars2.rhoMin,rebars2.as1,rebars2.as,rebars2.asMin,rebars2.asMin1,rebars2.asMin2,rebars2.ab,rebars2.nInitial,rebars2.nRounded,rebars2.sc,rebars2.scMin,rebars2.message,rebars2.centerBand,rebars2.nCenterBand,rebars2.nCenterBandRounded,rebars2.Ag,rebars2.beta1));
                    
                        document.getElementById('Summary').appendChild(createHeader3(`Summary:`));
                        
                        document.getElementById('Summary').appendChild(createParagraph(`Dc = ${dc2}mm`));
                        document.getElementById('Summary').appendChild(createParagraph(`B = ${squareDimension.B4}m`));
                        document.getElementById('Summary').appendChild(createParagraph(`L = ${squareDimension.L}m`));
                            
                        document.getElementById('Summary').appendChild(createParagraph(`No. Rebars= ${rebars.nRounded}pcs`));
                        document.getElementById('Summary').appendChild(createParagraph(`No. Rebars= ${rebars2.nRounded}pcs`));
                        
                    }
                }
            } 
            document.getElementById('saveButton').style.display = 'block';
            document.getElementById('tab').style.display = 'flex';
            
    // Save button functionality
    
    let results = document.getElementById('result').innerText;
    console.log("Results Content: ",results);
    let summary= document.getElementById('Summary').innerText;
    console.log("Summary Content: ",summary);
    resContent = results + summary;
    ;
    MathJax.typeset();            
    function printDiv(divId) {
        const originalContent = document.body.innerHTML;
        const printContent = document.getElementById(divId).outerHTML;

        document.body.innerHTML = printContent;
        window.print();
        document.body.innerHTML = originalContent;
    }
    const saveButtonElement = document.getElementById("saveButton");
    saveButtonElement.addEventListener("click", function() {
        printDiv("print");
        //SaveFile(resContent);

    });
        } catch (error) {
            console.error(`An error occurred: ${error}`);
            alert(`An error occurred: ${error}`);
        } 
    });
    //functions
    function calculateDimension(depth, dc, deadLoad, liveLoad, Mdl, Mll, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, ratioLengthB, ratioLengthL, limitLength , constraints){
        console.log(`start dimension`);
        let k = (ratioLengthL/ratioLengthB);
        const ds = depth - dc;
        const qnet = soilBearingCapacity - (unitWeightConcrete * dc / 1000) - (unitWeightSoil * ds / 1000) - surcharge; //c= qnet
        const P = deadLoad + liveLoad;
        const M = Mdl + Mll;
        const e = M/P; 
        let Af = P/qnet;
        let B1 = 0;
        let B2 = 0;
        if (constraints === 2) {
            B1 = Math.sqrt(Af);
            B2 = Math.ceil(B1 * 10) / 10;
            const length = Math.min(B2, limitLength);
            if (limitLength < B2) {
                console.log(`c = `,qnet);
                console.log(`P = `,P);
                console.log(`a = `,e);
                console.log(`k = `,limitLength);
                const B3 = ( (P*1000) + Math.sqrt(((P*1000)**2) + (4*limitLength*qnet*e*P*6000000)))/(2*limitLength*qnet)/1000;
                const B4 = limitLength;
                const L = Math.ceil(B3 * 10) / 10;
                console.log(`Bx = `,B3);
                console.log(`By = `,B4);
                return { k,ds, qnet, P, Af, B1, B2, length, B3, B4 ,L, limitLength,ratioLengthL, ratioLengthB,e,M }; 
            } else {
                //Double check:
                console.log(`limitLength > B2`)
                const B3 = B1;
                const B4 = B2;
                console.log(`Bx = `,B3);
                console.log(`By = `,B3);
                const L = B2;
                return { k,ds, qnet, P, Af, B1, B2, length, B3, B4, L, limitLength,ratioLengthL, ratioLengthB,e,M }; 
            } 
            
        } else if (constraints === 1) {
            console.log(`c = `,qnet);
            console.log(`P = `,P);
            console.log(`a = `,e);
            console.log(`k = `,k);
            const B3 = newtonRaphson(1)/1000;
            let L = Math.ceil(B3 * 10) / 10;
            console.log(`Bx = `,B3);
            const B2 = B3*k;
            console.log(`By = `,B2);
            const B4 = Math.ceil(B2 * 10) / 10;
            return { k, ds, qnet, P, Af, B1, B2, length, B3, B4, L, limitLength,ratioLengthL, ratioLengthB, e,M };
        
            } 
        function f(x) { 
            return (qnet/1000) * k * Math.pow(x, 3) - (P*1000) * x - 6 * (e*1000) * (P*1000);
        }
        
        // Derivative of the function
        function f_prime(x) {
           return 3 * (qnet/1000) * k * Math.pow(x, 2) - (P*1000);
        }
        
        // Newton-Raphson implementation
        function newtonRaphson(x0, tol = 1e-6, maxIter = 10000) {
            let x = x0;
            for (let i = 0; i < maxIter; i++) {
                const fx = f(x);
                const fpx = f_prime(x);
                if (Math.abs(fpx) < 1e-8) { // Avoid division by very small numbers
                    break;
                }
                const x_new = x - fx / fpx;
                if (Math.abs(x_new - x) < tol) {
                    return x_new;
                }
                x = x_new;
                console.log(`x: `,x);
            }
            
            return x; 
        }
        
        
    }
    function eccentricity (deadLoad,liveLoad,Mdl,Mll){
        let Pu1 = 1.4 * deadLoad;
        let Pu2 = (1.2 * deadLoad) + (1.6 * liveLoad);
        let Pu = Math.max(Pu1,Pu2);
        let Mu1 = 1.4 * Mdl;
        let Mu2 = (1.2 * Mdl) + (1.6 * Mll);
        let Mu = Math.max(Mu1,Mu2);
        let Eu = Mu/Pu;
        console.log(`Pu = `,Pu);
        console.log(`Mu = `,Mu);
        return {Pu1,Pu2,Pu,Mu1,Mu2,Mu,Eu};
    }
    function beamShearWithMoment(dc,cc,db,ax,qua,bx,by,cx,λ,fc,cy){
                                            console.log(`dc = `,dc);
        //transverse
        let d=dc+25-cc-0.5*db;              console.log(`d = `,d);
        let aax = (bx*1000-cx-2*d)/2;       console.log(`aax = `,aax);
        const f = (x) => (ax*x)+(qua);      console.log(`lower limit = `,bx-aax/1000);
        let vuTransverseCut = by * trapezoidalRule(f,bx-aax/1000,bx,10000);
                                            console.log(`Vu transverse = `,vuTransverseCut);
        let d1 = (vuTransverseCut*1000)/(0.125*λ*Math.sqrt(fc)*by*1000);
        console.log(`d = `,d1);
        let dc2 = d1 + cc + 0.5*db;
        let dc2Rounded = Math.ceil(dc2*25)/25;
        //longitudinal
        let d2=dc+25-cc-1.5*db;             console.log(`d = `,d2);
        let aay = (by*1000-cy-2*d2)/2;      console.log(`aay = `,aay);
       
        let vuLongitudinalCut = aay/1000 * trapezoidalRule(f,0,bx,10000);
                                            console.log(`Vu longitudinal = `,vuLongitudinalCut);
        let d3 = (vuLongitudinalCut*1000)/(0.125*λ*Math.sqrt(fc)*bx*1000);
                                            console.log(`d = `,d3);
        let dc3 = d3 + cc + 1.5*db;         console.log(`dc = `,dc3);
        let dc3Rounded = Math.ceil(dc3*25)/25;
                                            console.log(`dc3 Rounded = `,dc3Rounded);
        let finalDc = Math.max(dc3Rounded,dc2Rounded,dc);
                                            console.log(`final dc  = `,finalDc);
        function trapezoidalRule(func, a, b, n) {
            let h = (b - a) / n;
            let sum = 0.5 * (func(a) + func(b));
          
            for (let i = 1; i < n; i++) {
                sum += func(a + i * h);
            }
            
            return sum * h;

        }
        return {d,aax,vuLongitudinalCut,vuTransverseCut,d1,dc2,dc2Rounded,d2,aay,d3,dc3,dc3Rounded,finalDc};
    }

    function punchingShearAll(pu,cx,cy,d,by,bx,λ,fc){
        let ao = ((cy+d) * (cx+d))/1000000;
        let af = by*bx;
        let Vu = pu - pu*(ao/af);
        let d1 = newtonRaphson(1);
        console.log(`d = `,d1);
        
        function f(x) { 
            return 4*Math.pow(x,2) + 2*x*(columnWidthX+columnWidthY) - ((Vu*1000)/(0.75*(1/3)*λ*Math.sqrt(fc)));
        }
        
        // Derivative of the function
        function f_prime(x) {
           return 8*x + 2*(columnWidthX+columnWidthY);
        }
        
        // Newton-Raphson implementation
        function newtonRaphson(x0, tol = 1e-6, maxIter = 10000) {
            let x = x0;
            for (let i = 0; i < maxIter; i++) {
                const fx = f(x);
                const fpx = f_prime(x);
                if (Math.abs(fpx) < 1e-8) { // Avoid division by very small numbers
                    break;
                }
                const x_new = x - fx / fpx;
                if (Math.abs(x_new - x) < tol) {
                    return x_new;
                }
                x = x_new;
                console.log(`x: `,x);
            }
            
            return x; 
        }

        return {ao,af,Vu,d1};
    }
    function ultimate(dl,ll){
        let u1 = 1.4*dl;
        let u2 = 1.2*dl + 1.6*ll;
        let u = Math.max(u1,u2);
        return {u1,u2,u};
    }
    function beamShearAll(x1,x2,y1,y2,A,by,bx,Muy,Mux,Pu){
        let I_y = (1/12)*by*bx^3;
        let I_x = (1/12)*bx*by^3;
        let numSteps = 100000;
        const deltaY = (y2 - y1) / numSteps;
        const deltaX = (x2 - x1) / numSteps;

        let VBeam = 0;

        // Outer integral for y
        for (let i = 0; i < numSteps; i++) {
            const y = y1 + i * deltaY;
            
            let innerSum = 0;
            
            // Inner integral for x
            for (let j = 0; j < numSteps; j++) {
            const x = x1 + j * deltaX;

            // Function to integrate
            const value = (Pu / A) + (Muy * x / I_y) + (Mux * y / I_x);
            
            // Accumulate the inner sum
            innerSum += value * deltaX;
            }
            
            // Accumulate the outer sum
            VBeam += innerSum * deltaY;
        }
        console.log(`Vu beam = `,VBeam);
        return VBeam;
    }

    function punchingShearWithMoment(pu,bx,by,d,cx,cy,eu,λ,fc){
        let qua = pu*(1-((6*eu)/bx))/(bx*by);
        let qub = pu*(1+((6*eu)/bx))/(bx*by);
        let ax = (qub-qua)/bx;
        let dcx = d + cx;
        let dcy = d + cy;
        console.log(`qua = `,qua);
        console.log(`qub = `,qub);
        console.log(`ax = `,ax);
        console.log(`dcx = `,dcx);
        console.log(`dcy = `,dcy);
        console.log(`bx = `,bx);
        console.log(`by = `,by);
        const f = (x) => (ax*x)+(qua); // f(x) = x^2
        let Vu = (by*trapezoidalRule(f, 0, bx, 100000000))- (dcy/1000)*trapezoidalRule(f,(bx-(dcx/1000))/2,(bx+(dcx/1000))/2,10000000);
        console.log(`Vu = `,Vu);
        let a  = 4;
        let b = ((2*cx)+(2*cy));
        let c = (-((Vu*1000)/(0.25*λ*Math.sqrt(fc))));
        console.log(`a = `,a);
        console.log(`b = `,b);
        console.log(`c = `,c);
        let d2 = quadratic(a,b,c);
        console.log(`d = `,d2);

        function quadratic(a,b,c){
            let discriminant = b * b - 4 * a * c;

            // Check if the discriminant is non-negative
            if (discriminant < 0) {
                return null; // No real roots
            }
            let d = (-b + Math.sqrt(discriminant)) / (2 * a);
            return d;
        }

        function trapezoidalRule(func, a, b, n) {
            let h = (b - a) / n;
            let sum = 0.5 * (func(a) + func(b));
          
            for (let i = 1; i < n; i++) {
                sum += func(a + i * h);
            }
            
            return sum * h;

        }
        
        return {d2,qua,qub,ax,dcy,dcx,Vu} ;

    }

    function calculateDimensionSquare(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity) {
        const ds = depth - dc;
        const qnet = soilBearingCapacity - (unitWeightConcrete * dc / 1000) - (unitWeightSoil * ds / 1000) - surcharge;
        const P = deadLoad + liveLoad;
        const Af = P / qnet;
        const B1 = Math.sqrt(Af);
        const B2 = Math.ceil(B1 * 10) / 10;
        let B4 = B2;
        let L =B2;
        return { ds, qnet, P, Af, B1, B2,B4,L };
    }
    function calculateDimensionRectangular(depth, dc, deadLoad, liveLoad, unitWeightSoil, unitWeightConcrete, surcharge, soilBearingCapacity, limitLength, ratioLengthL, ratioLengthB, constraints) {
        const ds = depth - dc;
        const qnet = soilBearingCapacity - (unitWeightConcrete * dc / 1000) - (unitWeightSoil * ds / 1000) - surcharge;
        const P = deadLoad + liveLoad;
        const Af = P / qnet;
        let B1 = 0;
        let B2 = 0;
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
        let L = (ratioLengthB/ratioLengthL)*B3;
        L = Math.ceil(L * 10) / 10;
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
    function solutionMethod(method, structureType,columnShape) {
        if (structureType === "Isolated Square") {
            if (method === 1) { 
                if (columnShape === "rectangular") {
                    return 111; 
                } else {
                    return 112;    
                }
            }
            if (method === 2) {
                if (columnShape === "rectangular") {
                    return 121; 
                } else {
                    return 122;    
                }
            }
          
        } else if (structureType === "Isolated Rectangular") {
            if (method === 1) {
                if (columnShape === "rectangular") {
                    return 211; 
                } else {
                    return 212;    
                }
            }
            if (method === 2) {
                if (columnShape === "rectangular") {
                    return 221; 
                } else {
                    return 222;    
                }
            }
        
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
        let sc=0, scMin=0, centerBand=0, nCenterBand=0, nCenterBandRounded=0,Ag;
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
            console.log("sc:",sc);
            scMin = Math.max(50, diaBar);
            console.log("d12");
           sc=sc;
            centerBand = 2 / (beta+1);
            nCenterBand = centerBand * nRounded;
            nCenterBandRounded = Math.ceil(nCenterBand);
        } else {
            console.log("DRRB");
        }
        sc=sc;
        console.log("sc:",sc);
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
    if(Dimension1.B4===Dimension1.L){
    resultsContent.appendChild(createHeader5(`Shear Along Bottom Bars:`));
    resultsContent.appendChild(createParagraph(`d = D<sub>c</sub> - C<sub>c</sub> - 0.5d<sub>b</sub> = ${dc2} mm - ${clearCover} mm - 0.5(${barDia} mm) = ${beamShearResult.xAxis.d} mm`));
    resultsContent.appendChild(createParagraph(`aa = (B - c - 2d) / 2 = (${Dimension1.L * 1000} mm - ${columnWidth} mm - 2(${beamShearResult.xAxis.d} mm)) / 2 = ${beamShearResult.xAxis.aa.toFixed(2)} mm`));
    resultsContent.appendChild(createParagraph(`V<sub>u</sub> = q<sub>u</sub> * B * aa = ${punchingShearVu1.qu.toFixed(2)} kPa * ${Dimension1.B4} m * ${beamShearResult.xAxis.aa / 1000} m = ${(beamShearResult.xAxis.Vu/1000000).toFixed(2)} kN`));
    resultsContent.appendChild(createParagraph(`ΦV<sub>n</sub> = (1/6) * λ * √f'c * B * d = (1/6) * ${λ} * √${fc} * ${Dimension1.B4 * 1000} mm * ${beamShearResult.xAxis.d} mm = ${(beamShearResult.xAxis.ΦVn/1000).toFixed(2)} kN `));
    const xVu = parseFloat(beamShearResult.xAxis.Vu/1000000);
    const xVn = parseFloat(beamShearResult.xAxis.ΦVn/1000);
    resultsContent.appendChild(createParagraph(`Status: ${(xVu) > (xVn) ? 'Failed' : 'Passed'}`));resultsContent.appendChild(createHeader5(`Shear Along Top Bars:`));
    resultsContent.appendChild(createParagraph(`d = D<sub>c</sub> - C<sub>c</sub> - 1.5d<sub>b</sub> = ${dc2} mm - ${clearCover} mm - 1.5(${barDia} mm) = ${beamShearResult.yAxis.d} mm`));
    resultsContent.appendChild(createParagraph(`aa = (B - c - 2d) / 2 = (${Dimension1.B4 * 1000} mm - ${columnWidth} mm - 2(${beamShearResult.yAxis.d} mm)) / 2 = ${beamShearResult.yAxis.aa.toFixed(2)} mm`));
    resultsContent.appendChild(createParagraph(`V<sub>u</sub> = q<sub>u</sub> * B * aa = ${punchingShearVu1.qu.toFixed(2)} kPa * ${Dimension1.L} m * ${beamShearResult.yAxis.aa / 1000} m = ${(beamShearResult.yAxis.Vu/1000000).toFixed(2)} kN`));
    resultsContent.appendChild(createParagraph(`ΦV<sub>n</sub> = (1/6) * λ * √f'c * B * d = (1/6) * ${λ} * √${fc} * ${Dimension1.L * 1000} mm * ${beamShearResult.yAxis.d} mm = ${(beamShearResult.yAxis.ΦVn/1000).toFixed(2)} kN `));
    const yVu = parseFloat(beamShearResult.yAxis.Vu/1000000);
    const yVn = parseFloat(beamShearResult.yAxis.ΦVn/1000);
    
    resultsContent.appendChild(createParagraph(`Status: ${(yVu) > (yVn) ? 'Failed' : 'Passed'}`));resultsContent.appendChild(createParagraph(`Status: ${(beamShearResult.yAxis.Vu/1000000) > (beamShearResult.yAxis.ΦVn/1000) ? 'Failed' : 'Passed'}`));
    
    } else {
    resultsContent.appendChild(createHeader5(`Shear Along Long Span:`));
    resultsContent.appendChild(createParagraph(`d = D<sub>c</sub> - C<sub>c</sub> - 0.5d<sub>b</sub> = ${dc2} mm - ${clearCover} mm - 0.5(${barDia} mm) = ${beamShearResult.xAxis.d} mm`));
    resultsContent.appendChild(createParagraph(`aa = (L - c - 2d) / 2 = (${Dimension1.L * 1000} mm - ${columnWidth} mm - 2(${beamShearResult.xAxis.d} mm)) / 2 = ${beamShearResult.xAxis.aa.toFixed(2)} mm`));
    resultsContent.appendChild(createParagraph(`V<sub>u</sub> = q<sub>u</sub> * B * aa = ${punchingShearVu1.qu.toFixed(2)} kPa * ${Dimension1.B4} m * ${beamShearResult.xAxis.aa / 1000} m = ${(beamShearResult.xAxis.Vu/1000000).toFixed(2)} kN`));
    resultsContent.appendChild(createParagraph(`ΦV<sub>n</sub> = (1/6) * λ * √f'c * B * d = (1/6) * ${λ} * √${fc} * ${Dimension1.B4 * 1000} mm * ${beamShearResult.xAxis.d} mm = ${(beamShearResult.xAxis.ΦVn/1000).toFixed(2)} kN `));
    const xVu = parseFloat(beamShearResult.xAxis.Vu/1000000);
    const xVn = parseFloat(beamShearResult.xAxis.ΦVn/1000);
    resultsContent.appendChild(createParagraph(`Status: ${(xVu) > (xVn) ? 'Failed' : 'Passed'}`));
    resultsContent.appendChild(createHeader5(`Shear Along Short Span:`));
    resultsContent.appendChild(createParagraph(`d = D<sub>c</sub> - C<sub>c</sub> - 1.5d<sub>b</sub> = ${dc2} mm - ${clearCover} mm - 1.5(${barDia} mm) = ${beamShearResult.yAxis.d} mm`));
    resultsContent.appendChild(createParagraph(`aa = (B - c - 2d) / 2 = (${Dimension1.B4 * 1000} mm - ${columnWidth} mm - 2(${beamShearResult.yAxis.d} mm)) / 2 = ${beamShearResult.yAxis.aa.toFixed(2)} mm`));
    resultsContent.appendChild(createParagraph(`V<sub>u</sub> = q<sub>u</sub> * L * aa = ${punchingShearVu1.qu.toFixed(2)} kPa * ${Dimension1.L} m * ${beamShearResult.yAxis.aa / 1000} m = ${(beamShearResult.yAxis.Vu/1000000).toFixed(2)} kN`));
    resultsContent.appendChild(createParagraph(`ΦV<sub>n</sub> = (1/6) * λ * √f'c * L * d = (1/6) * ${λ} * √${fc} * ${Dimension1.L * 1000} mm * ${beamShearResult.yAxis.d} mm = ${(beamShearResult.yAxis.ΦVn/1000).toFixed(2)} kN `));
    const yVu = parseFloat(beamShearResult.yAxis.Vu/1000000);
    const yVn = parseFloat(beamShearResult.yAxis.ΦVn/1000);
    
    resultsContent.appendChild(createParagraph(`Status: ${(yVu) > (yVn) ? 'Failed' : 'Passed'}`));
    }
    return resultsContent;
}
function rebarDisplay(B,L,Dc,Cc,db,diaBar, c, qu, fc, fy, b, bp, d, aa, Mu, ct, beta, num, at, reductionFactor, muMax, SRRB, Rn, rho, rhoMin1, rhoMin2, rhoMin,as1, as, asMin, asMin1, asMin2, ab, nInitial, nRounded, sc, scMin, message, centerBand, nCenterBand, nCenterBandRounded, Ag,beta1){
    console.log("r1");
    console.log("sc inside:",sc);
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
    resultsContent.appendChild(createParagraph(`Mu<sub>max</sub> = 0.9 x ${beta1.toFixed(4)} x ${fc}MPa x ${at}mm x ${b*1000}mm x (${d}mm - (${at}mm / 2)) = ${(muMax).toFixed(2)} kNm`));
    resultsContent.appendChild(createParagraph(`Mu ${Mu > muMax ? `>`:`<`} Mu<sub>max</sub>`));
    resultsContent.appendChild(createParagraph(`∴ ${Mu < muMax ? "SRRB":"DRRB"}`));
    resultsContent.appendChild(createParagraph(``));
    console.log("r4");
   
    if (Mu < muMax) {
    
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
    resultsContent.appendChild(createParagraph(`sc = (b - 2Cc - ndb) / (n - 1) = (${b*1000} - 2${Cc} - ${nRounded}x${diaBar}) / (${nRounded} - 1) = ${sc}mm`));
    resultsContent.appendChild(createParagraph(`sc<sub>min</sub> = least of (50mm , Bar Diameter, 4/3rd of dAgg) = ${scMin.toFixed(2)}mm`));
    resultsContent.appendChild(createParagraph(`sc ${sc < scMin ? `<`:`>`} sc<sub>min</sub>`));
    resultsContent.appendChild(createParagraph(`∴${sc < scMin ? `Failed, increase dimension if possible`:`Passed`}.`));
    resultsContent.appendChild(createParagraph(`Centerband = 2 / β+1 = 2 / (${beta} + 1) = ${centerBand.toFixed(2)}`));
    resultsContent.appendChild(createParagraph(`n<sub>centerband</sub> = Centerband x n = ${centerBand} x ${nRounded} = ${nCenterBand} ≈ ${nCenterBandRounded} pcs`));
    }
    console.log("sc print :", sc);
    console.log("r7");
    return resultsContent;
}
    
    
});

