import { SaveFile } from './script.js';

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('formFoundation').addEventListener('submit',function(event){
        event.preventDefault();
        try {
            const resultDiv = document.getElementById("result");
            resultDiv.innerHTML = ''; // Clear previous results
            const summaryDiv = document.getElementById("Summary");
            summaryDiv.innerHTML = ''; // Clear previous results

        


        function determineMethod(structureType, loadType, columnShape, centricity, method) {
            let n = "";  // Initialize the variable
            
            // Mapping structure type
            if (structureType === "Isolated Square") {
                n += "IS";
            } else if (structureType === "Isolated Rectangular") {
                n += "IR";
            } else if (structureType === "Strip") {
                n += "ST";
            }
        
            // Mapping load type
            if (loadType === "ultimate") {
                n += "-UL";
            } else {
                n += "-SW";  // Assuming "SW" is for Service Load
            }
        
            // Mapping column shape
            if (columnShape === "square") {
                n += "-SQ";
            } else if (columnShape === "rectangular") {
                n += "-RC";
            } else if (columnShape === "circle") {
                n += "-CR";
            }
        
            // Mapping centricity
            if (centricity === "concentric") {
                n += "-CC";
            } else if (centricity === "eccentric") {
                n += "-EC";
            }
        
            // Adding method as the final number
            n += `-${method}`;
        
            return n;
        }
                
        function createParagraph(content) {
            const p = document.createElement('p');
            p.innerHTML = content;
            return p;
        }
        function createHeader7(content) {
            const h7 = document.createElement('h7');
            h7.innerHTML = content;
            return h7;
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
        function dimension(DC){
            let dc = DC;
            let ds = (h*1000) - dc;
            let qnet = qa - (ys*(ds/1000)) -(yc*(dc/1000)) - q;
            let pu1;
            let pu2;
            let mux1;
            let mux2;
            let muy1;
            let muy2;
            document.getElementById('result').appendChild(createHeader5(`Dimensions Calculation`));       
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_s = H - D_c = ${h*1000}mm - ${dc}mm = ${ds}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = q_{all} - (\\gamma_s \\times D_s) - (\\gamma_c \\times D_c) - q =  ${qa}kPa - (${ys}\\frac{kN}{m^3} \\times ${ds/1000}m) - (${yc}\\frac{kN}{m^3} \\times ${dc/1000}m) - ${q}kPa = ${qnet.toFixed(2)}kPa  \$$`));
            console.log(`qnet = ${qnet}`);
            document.getElementById('result').appendChild(createHeader7(`Service Load Calculation`));       
            
            if(loadType==="ultimate"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ P = ${p}kN \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_x = ${mx}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_y = ${my}kNm   \$$`));
                
            } else if (loadType==="individual"){
                p = pdl + pll;
                mx = mdlx + mllx;
                my = mdly + mlly;
                document.getElementById('result').appendChild(createParagraph(`$$\\ P = P_{DL} + P{LL} = ${pdl}kN + ${pll}kN = ${p}kN \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_x = M_{xDL} + M_{xLL} = ${mdlx}kNm + ${mllx}kNm = ${mx}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_y = M_{yDL} + M_{yLL} = ${mdly}kNm + ${mlly}kNm = ${my}kNm   \$$`));
                
            }
            document.getElementById('result').appendChild(createHeader7(`Solve Service Eccentricity`));       
            
            let ey = my / p;
            let ex = mx / p;
            document.getElementById('result').appendChild(createParagraph(`$$\\ e_x = \\frac {M_y}{P} = \\frac {${my}kNm}{${p}kN} = ${(ex*1000).toFixed(2)}mm   \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ e_y = \\frac {M_x}{P} = \\frac {${mx}kNm}{${p}kN} = ${(ey*1000).toFixed(2)}mm   \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B_y\\times B_x}\\times (1 + \\frac{6\\times e_x}{B_x} + \\frac{6\\times e_y}{B_y}) \$$`));
            
            document.getElementById('result').appendChild(createHeader7(`Solve for \\( B_x \\)`)); 
            if (restrictionType === "1"){
                //Ratio
                let k = ratioLengthB/ratioLengthL;
                let A = qnet*k/p;
                let C = (6*ex)+((6*ey)/k);   
                let initialGuess = 1; 
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{k \\times B_x^2}\\times (1 + \\frac{6\\times e_x}{B_x} + \\frac{6\\times e_y}{k \\times B_x}) \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{${k.toFixed(3)} \\times B_x^2}\\times (1 + \\frac{6\\times ${ex.toFixed(3)}m}{B_x} + \\frac{6\\times ${ey.toFixed(3)}m}{${k.toFixed(3)} \\times B_x}) \$$`));
                let Bx_solution = newtonRaphson(A, C, initialGuess,"1");
                console.log(`Solution for B_x: ${Bx_solution}`);
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_x = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_y = k \\times B_x = ${k.toFixed(3)} \\times ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(k*Bx_solution*10)/10}m \$$`));
                bx = Math.ceil(Bx_solution*100)/100;
                by = Math.ceil(k*Bx_solution*100)/100;
            } else if ( restrictionType === "2"){
                //Limited
                by = limitLength;
                let initialGuess = 1; 
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{${by.toFixed(2)}m \\times B_x}\\times (1 + \\frac{6\\times ${ex.toFixed(3)}m}{B_x} + \\frac{6\\times ${ey.toFixed(3)}m}{${by.toFixed(2)}m \\times B_x}) \$$`));
                let Bx_solution = newtonRaphson(0, 0, initialGuess,"2",qnet,by,p,ex,ey);
                console.log(`Solution for B_x: ${Bx_solution}`);
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_x = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
                bx = Math.ceil(Bx_solution*10)/10;
            }
            document.getElementById('result').appendChild(createHeader7(`Solve for Ultimate Loads`));
            if(loadType==="ultimate"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ Pu = ${pu}kN \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy}kNm   \$$`));
                
            } else if (loadType==="individual"){
                if (considerSoil==="yes"){
                    pu1 = 1.4*(pdl)+1.4*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                    pu2 = 1.2*pdl +1.6*pll + 1.2*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u1} = 1.4 \\times P_{DL} + 1.4 \\times [(\\gamma_s \\times D_s) + (\\gamma_c \\times D_c) + q] \\times B_y \\times B_x = 1.4 \\times ${pdl}kN + 1.4 \\times [(${ys} \\frac{kN}{m^3} \\times ${ds/1000}m) + (${yc} \\frac{kN}{m^3} \\times ${dc/1000}m) + ${q}kPa] \\times ${by}m \\times ${bx}m = ${pu1.toFixed(2)}kN \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u2} = 1.2 \\times P_{DL} + 1.6 \\times P_{LL} + 1.2 \\times [(\\gamma_s \\times D_s) + (\\gamma_c \\times D_c) + q] \\times B_y \\times B_x = 1.2 \\times ${pdl}kN + 1.6 \\times ${pll}kN + 1.2 \\times [(${ys} \\frac{kN}{m^3} \\times ${ds/1000}m) + (${yc} \\frac{kN}{m^3} \\times ${dc/1000}m) + ${q}kPa] \\times ${by}m \\times ${bx}m  = ${pu2.toFixed(2)}kN \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u} = ${Math.max(pu1,pu2).toFixed(2)}kN - GOVERN\$$`));
                    pu = Math.max(pu1,pu2); 
                } else {
                    pu1 = 1.4*pdl;
                    pu2 = 1.2*pdl +1.6*pll;
                    
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u1} = 1.4 \\times P_{DL} = 1.4 \\times ${pdl}kN = ${pu1.toFixed(2)}kN \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u2} = 1.2 \\times P_{DL} + 1.6 \\times P_{LL} = 1.2 \\times ${pdl}kN + 1.6 \\times ${pll}kN = ${pu2.toFixed(2)}kN \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u} = ${Math.max(pu1,pu2).toFixed(2)}kN - GOVERN\$$`));
                    pu = Math.max(pu1,pu2); 
                     }
                mux1 = 1.4*(mdlx);
                mux2 = 1.2*mdlx +1.6*mllx;
                muy1 = 1.4*(mdly);
                muy2 = 1.2*mdly +1.6*mlly;
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux1} = 1.4 \\times M_{xDL} = 1.4 \\times ${mdlx}kNm = ${mux1.toFixed(2)}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux2} = 1.2 \\times M_{xDL} + 1.6 \\times M_{xLL} = 1.2 \\times ${mdlx}kNm + 1.6 \\times ${mllx}kNm = ${mux2.toFixed(2)}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${Math.max(mux1,mux2).toFixed(2)}kNm - GOVERN\$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy1} = 1.4 \\times M_{yDL} = 1.4 \\times ${mdly}kNm = ${muy1.toFixed(2)}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy2} = 1.2 \\times M_{yDL} + 1.6 \\times M_{yLL} = 1.2 \\times ${mdly}kNm + 1.6 \\times ${mlly}kNm = ${muy2.toFixed(2)}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${Math.max(muy1,muy2).toFixed(2)}kNm - GOVERN\$$`));
                document.getElementById('result').appendChild(createHeader7(`Solve for Ultimate Eccentricity`));
                let euy = mux/pu;
                let eux = muy/pu;
                let con = (6*euy/by)+(6*eux/bx);
                document.getElementById('result').appendChild(createParagraph(`$$\\ e_{ux} = \\frac{M_{uy}}{P} = \\frac{${muy.toFixed(2)}kNm}{${pu.toFixed(2)}kN} = ${(eux*1000).toFixed(2)}mm\$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ e_{uy} = \\frac{M_{ux}}{P} = \\frac{${mux.toFixed(2)}kNm}{${pu.toFixed(2)}kN} = ${(euy*1000).toFixed(2)}mm\$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ 6 \\times \\frac{e_{ux}}{B_x} + 6 \\times \\frac{e_{uy}}{B_y} \\le 1 \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ 6 \\times \\frac{${(eux*1000).toFixed(2)}mm}{${(bx*1000).toFixed(2)}mm} + 6 \\times \\frac {${(euy*1000).toFixed(2)}mm}{${(by*1000).toFixed(2)}mm} \\le 1 \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${con.toFixed(6)} ${con > 1 ? "> 1 \\therefore Case 1, With Tension":"< 1 \\therefore Case 2, Without Tension"} \$$`));
                

            }
       
            function newtonRaphson(A, C, initialGuess, restrictionType, q_a_max, by, p, ex, ey, tolerance = 1e-6, maxIterations = 1000000) {
                let Bx = initialGuess; // Initial guess for Bx
                let f_Bx;
                let f_prime_Bx;
                for (let i = 0; i < maxIterations; i++) {
                   
                    if (restrictionType === "1" ){
                        f_Bx = A * Math.pow(Bx, 3) - Bx - C;
                        f_prime_Bx = 3 * A * Math.pow(Bx, 2) - 1;
                    } else if (restrictionType === "2"){
                        f_Bx = (q_a_max * by * Bx) - (p * (1 + (6 * ex / Bx))) - (p * 6 * ey / by);
                        f_prime_Bx = (q_a_max * by) + (p * 6 * ex / Math.pow(Bx, 2));
                    }
                    // Update Bx using Newton-Raphson formula
                    let next_Bx = Bx - f_Bx / f_prime_Bx;
            
                    // Check if the approximation is within tolerance
                    if (Math.abs(next_Bx - Bx) < tolerance) {
                        console.log(`Converged to ${next_Bx} after ${i+1} iterations.`);
                        return next_Bx;
                    }
            
                    // Update Bx for the next iteration
                    Bx = next_Bx;
                }
            
                console.log("Did not converge within the maximum number of iterations.");
                return Bx; // Return the last approximation if not converged

            }
            
               
            
            
        }

        function punchingShear(){
            let d = dc - cc - barDia;
            let Ao = (d + cx)*(d+cy);
            let Af = (by*1000)*(bx*1000);
            let Vu = pu - pu *(Ao/Af);
            let print = "";
            let vn;
            console.log(`Ao = `,Ao);
            console.log(`Punching Shear Vu = `,Vu);
            document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation`));       
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - d_b = ${dc}mm - ${cc}mm - ${barDia}mm = ${d}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ A_o = (d + c_x)\\times (d + c_y) = (${d}mm + ${cx})\\times (${d}mm + ${cy}) = ${Ao.toFixed(2)}mm^2 \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ A_f = B_y \\times B_x = ${by*1000}mm \\times ${bx*1000}mm = ${Af.toFixed(2)}mm^2 \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = P_u - P_u \\times (\\frac{A_o}{A_f} ) = ${pu}kN - ${pu}kN \\times (\\frac{${Ao.toFixed(2)}mm^2}{${Af.toFixed(2)}mm^2} ) = ${Vu.toFixed(2)}kN \$$`));
            /*vn = phiVn()
            function phiVn(B,text){
                console.log(fc)
                let vn = 0.75 * (1/6) * lambda * Math.sqrt(fc) *(2*(d+cx)+2*(d+cy))*depth/1000;
                document.getElementById('result').appendChild(createParagraph(`$$\\phi V_n = \\phi \\times \\frac {1}{6} \\times \\lambda \\times \\sqrt{fc'} \\times ${text} \\times d = 0.75 \\times \\frac {1}{6} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${B}mm \\times ${depth}mm = ${(vn*1000).toFixed(2)}N \\approx ${(vn).toFixed(2)}kN\$$`));
            
                return vn;
            }*/
            return {Ao,Af,Vu};
        }
        function beamShear(axis){
            let x1;
            let x2;
            let y1;
            let y2;
            let vn;
            let depth;
            if(axis === "y"){
            //ACROSS X AXIS or ALONG Y AXIS
            depth = dc - cc - (1.5*barDia);
            x1 = (cx/2)+depth;      console.log(`x1 = `,x1);
            x2 = ((bx*1000)/2);            console.log(`x2 = `,x2);
            y1 = -((by*1000)/2);           console.log(`y1 = `,y1);
            y2 = (by*1000)/2;              console.log(`y2 = `,y2);
            
            document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Along Y-axis (Cut Across X-axis)`));       
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {c_x}{2} + d = \\frac {${cx}mm}{2} + {${depth}mm} = ${x1}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {-B_y}{2} = \\frac {${-by*1000}mm}{2} = ${y1}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
            vn = phiVn(by*1000,"B_y");       
            } else if (axis === "x"){
            //ACROSS X AXIS or ALONG Y AXIS
            depth = dc - cc - (0.5*barDia);
            x1 = -((bx*1000)/2);           console.log(`x1 = `,x1);
            x2 = (bx*1000)/2;              console.log(`x2 = `,x2);
            y1 = (cy/2)+depth;      console.log(`y1 = `,y1);
            y2 = ((by*1000)/2);            console.log(`y2 = `,y2);
            document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Along X-axis (Cut Across Y-axis)`));       
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {-B_x}{2} = \\frac {${-bx*1000}mm}{2} = ${x1}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {c_y}{2} + d = \\frac {${cy}mm}{2} + ${depth}mm = ${y1}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
            
            vn = phiVn(bx*1000,"B_x");
            }
            let a = x2 - x1;            console.log(`a = `,a);
            let b = y2 - y1;            console.log(`b = `,b);    
            let c = x2 + x1;            console.log(`c = `,c);
            let d = y2 + y1;            console.log(`d = `,d);
            let Vu = ((a*b)/(by*bx*1000*1000))*(pu+((6*c*muy)/Math.pow(bx*1000,2))+((6*d*mux)/Math.pow(by*1000,2)));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 - x_1 = ${x2}mm - (${x1})mm = ${a}mm\$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 - y_1 = ${y2}mm - (${y1})mm = ${b}mm\$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 + x_1 = ${x2}mm + (${x1})mm = ${c}mm\$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 + y_1 = ${y2}mm + (${y1})mm = ${d}mm\$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\frac{(x_2 - x_1)\\times(y_2 - y_1)}{B_y \\times B_x}\\times (P_u + \\frac{6 \\times (x_2 + x_1) \\times M_{uy}}{B_x^2} + \\frac{6 \\times (y_2 + y_1) \\times M_{ux}}{B_y^2} ) \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\frac{(${a}mm)\\times(${b}mm)}{${by*1000}mm \\times ${bx*1000}mm}\\times (${pu}kN + \\frac{6 \\times (${c}mm) \\times ${muy}kNm}{(${bx*1000}mm)^2} + \\frac{6 \\times (${d}mm) \\times ${mux}kNm}{(${by*1000}mm)^2} ) \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = ${Vu.toFixed(2)}kN ${Vu<vn ? "< \\phi V_n    \\therefore SAFE":"> \\phi V_{n}\\therefore FAIL"}\$$`));
            function phiVn(B,text){
                console.log(fc)
                let vn = 0.75 * (1/6) * lambda * Math.sqrt(fc) *B *depth/1000;
                document.getElementById('result').appendChild(createParagraph(`$$\\phi V_n = \\phi \\times \\frac {1}{6} \\times \\lambda \\times \\sqrt{fc'} \\times ${text} \\times d = 0.75 \\times \\frac {1}{6} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${B}mm \\times ${depth}mm = ${(vn*1000).toFixed(2)}N \\approx ${(vn).toFixed(2)}kN\$$`));
            
                return vn;
            }
            console.log(`Beam Shear Vu = `,Vu);
            console.log(`Beam Shear phi Vn = `,vn);

        }
        
        
        
        //GET PARAMETERS
        const structureType = document.getElementById('structureType').value;
        const restrictionType = document.getElementById('LengthRestriction').value;
        const ratioLengthL = parseFloat(document.getElementById('RatioL').value);
        const ratioLengthB = parseFloat(document.getElementById('RatioB').value); 
        const limitLength =  parseFloat(document.getElementById('Limitation').value);
        const centricity =  document.getElementById('centricity').value;
        const loadType = document.getElementById('loadType').value;

        let p = parseFloat(document.getElementById('AllowableLoad').value);
        let mx = parseFloat(document.getElementById('AllowableMx').value);
        let my = parseFloat(document.getElementById('AllowableMy').value);

        let pu = parseFloat(document.getElementById('UltimateLoad').value);
        let mux = parseFloat(document.getElementById('UltimateMx').value);
        let muy = parseFloat(document.getElementById('UltimateMy').value);
        const pdl = parseFloat(document.getElementById('DeadLoad').value);
        const pll = parseFloat(document.getElementById('LiveLoad').value);
        const mdlx = parseFloat(document.getElementById('mdlx').value);
        const mllx = parseFloat(document.getElementById('mllx').value);
        const mdly = parseFloat(document.getElementById('mdly').value);
        const mlly = parseFloat(document.getElementById('mlly').value);
        const h = parseFloat(document.getElementById('Depth').value);
        const barDia = parseInt(document.getElementById('BarDiameter').value);
        const method = parseInt(document.getElementById('Method').value);
        const columnShape = document.getElementById('columnShape').value;
        let C = parseInt(document.getElementById('ColumnWidth').value);
        let cx = parseInt(document.getElementById('ColumnWidthX').value);
        let cy = parseInt(document.getElementById('ColumnWidthY').value);
        let columnLocation = parseInt(document.getElementById('ColumnLocation').value);
        const qa = parseFloat(document.getElementById('SoilBearingCapacity').value);
        const q = parseFloat(document.getElementById('Surcharge').value);
        const lambda = parseInt(document.getElementById('λ').value);
        const fc = parseFloat(document.getElementById('fc').value);
        const fy = parseFloat(document.getElementById('fy').value);
        const ys = parseFloat(document.getElementById('UnitWeightSoil').value);
        const yc = parseFloat(document.getElementById('UnitWeightConcrete').value);
        const considerSoil = document.getElementById('considerSoil').value;
        let dc= 250;
        let cc = 75;
        let by;
        let bx;
        let logic = determineMethod(structureType,loadType,columnShape,centricity,method);
        console.log(`logic: `, logic);
        let dim = dimension(400);
        let vuPunching = punchingShear ();
        let vuBeamX = beamShear ("x");
        let vuBeamY = beamShear ("y");
        if (logic === "IS-UL-SQ-CC-1") {
            // your code here
        } else if (logic === "IS-UL-SQ-CC-2") {
            // your code here
        } else if (logic === "IS-UL-SQ-EC-1") {
            // your code here
        } else if (logic === "IS-UL-SQ-EC-2") {
            // your code here
        } else if (logic === "IS-UL-RC-CC-1") {
            // your code here
        } else if (logic === "IS-UL-RC-CC-2") {
            // your code here
        } else if (logic === "IS-UL-RC-EC-1") {
            // your code here
        } else if (logic === "IS-UL-RC-EC-2") {
            // your code here
        } else if (logic === "IS-UL-CR-CC-1") {
            // your code here
        } else if (logic === "IS-UL-CR-CC-2") {
            // your code here
        } else if (logic === "IS-UL-CR-EC-1") {
            // your code here
        } else if (logic === "IS-UL-CR-EC-2") {
            // your code here
        } else if (logic === "IS-SW-SQ-CC-1") {
            // your code here
        } else if (logic === "IS-SW-SQ-CC-2") {
            // your code here
        } else if (logic === "IS-SW-SQ-EC-1") {
            // your code here
        } else if (logic === "IS-SW-SQ-EC-2") {
            // your code here
        } else if (logic === "IS-SW-RC-CC-1") {
            // your code here
        } else if (logic === "IS-SW-RC-CC-2") {
            // your code here
        } else if (logic === "IS-SW-RC-EC-1") {
            // your code here
        } else if (logic === "IS-SW-RC-EC-2") {
            // your code here
        } else if (logic === "IS-SW-CR-CC-1") {
            // your code here
        } else if (logic === "IS-SW-CR-CC-2") {
            // your code here
        } else if (logic === "IS-SW-CR-EC-1") {
            // your code here
        } else if (logic === "IS-SW-CR-EC-2") {
            // your code here
        } else if (logic === "IR-UL-SQ-CC-1") {
            // your code here
        } else if (logic === "IR-UL-SQ-CC-2") {
            // your code here
        } else if (logic === "IR-UL-SQ-EC-1") {
            // your code here
        } else if (logic === "IR-UL-SQ-EC-2") {
            // your code here
        } else if (logic === "IR-UL-RC-CC-1") {
            // your code here
        } else if (logic === "IR-UL-RC-CC-2") {
            // your code here
        } else if (logic === "IR-UL-RC-EC-1") {
            // your code here
        } else if (logic === "IR-UL-RC-EC-2") {
            // your code here
        } else if (logic === "IR-UL-CR-CC-1") {
            // your code here
        } else if (logic === "IR-UL-CR-CC-2") {
            // your code here
        } else if (logic === "IR-UL-CR-EC-1") {
            // your code here
        } else if (logic === "IR-UL-CR-EC-2") {
            // your code here
        } else if (logic === "IR-SW-SQ-CC-1") {
            // your code here
        } else if (logic === "IR-SW-SQ-CC-2") {
            // your code here
        } else if (logic === "IR-SW-SQ-EC-1") {
            // your code here
        } else if (logic === "IR-SW-SQ-EC-2") {
            // your code here
        } else if (logic === "IR-SW-RC-CC-1") {
            // your code here
        } else if (logic === "IR-SW-RC-CC-2") {
            // your code here
        } else if (logic === "IR-SW-RC-EC-1") {
            // your code here
        } else if (logic === "IR-SW-RC-EC-2") {
            // your code here
        } else if (logic === "IR-SW-CR-CC-1") {
            // your code here
        } else if (logic === "IR-SW-CR-CC-2") {
            // your code here
        } else if (logic === "IR-SW-CR-EC-1") {
            // your code here
        } else if (logic === "IR-SW-CR-EC-2") {
            // your code here
        } else if (logic === "ST-UL-SQ-CC-1") {
            // your code here
        } else if (logic === "ST-UL-SQ-CC-2") {
            // your code here
        } else if (logic === "ST-UL-SQ-EC-1") {
            // your code here
        } else if (logic === "ST-UL-SQ-EC-2") {
            // your code here
        } else if (logic === "ST-UL-RC-CC-1") {
            // your code here
        } else if (logic === "ST-UL-RC-CC-2") {
            // your code here
        } else if (logic === "ST-UL-RC-EC-1") {
            // your code here
        } else if (logic === "ST-UL-RC-EC-2") {
            // your code here
        } else if (logic === "ST-UL-CR-CC-1") {
            // your code here
        } else if (logic === "ST-UL-CR-CC-2") {
            // your code here
        } else if (logic === "ST-UL-CR-EC-1") {
            // your code here
        } else if (logic === "ST-UL-CR-EC-2") {
            // your code here
        } else if (logic === "ST-SW-SQ-CC-1") {
            // your code here
        } else if (logic === "ST-SW-SQ-CC-2") {
            // your code here
        } else if (logic === "ST-SW-SQ-EC-1") {
            // your code here
        } else if (logic === "ST-SW-SQ-EC-2") {
            // your code here
        } else if (logic === "ST-SW-RC-CC-1") {
            // your code here
        } else if (logic === "ST-SW-RC-CC-2") {
            // your code here
        } else if (logic === "ST-SW-RC-EC-1") {
            // your code here
        } else if (logic === "ST-SW-RC-EC-2") {
            // your code here
        } else if (logic === "ST-SW-CR-CC-1") {
            // your code here
        } else if (logic === "ST-SW-CR-CC-2") {
            // your code here
        } else if (logic === "ST-SW-CR-EC-1") {
            // your code here
        } else if (logic === "ST-SW-CR-EC-2") {
            // your code here
        }
        MathJax.typeset();     
   } catch {

   }
 });


});