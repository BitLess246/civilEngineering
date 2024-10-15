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
            if(recheck===0){
                if(loadType==="ultimate"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P = ${p}kN \$$`));
                    if (centricity === "eccentric"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_x = ${mx}kNm \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_y = ${my}kNm   \$$`));
                    }
                } else if (loadType==="individual"){
                    p = pdl + pll;
                    if (centricity === "eccentric"){
                    mx = mdlx + mllx;
                    my = mdly + mlly;
                }
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P = P_{DL} + P{LL} = ${pdl}kN + ${pll}kN = ${p}kN \$$`));
                    if (centricity === "eccentric"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_x = M_{xDL} + M_{xLL} = ${mdlx}kNm + ${mllx}kNm = ${mx}kNm \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_y = M_{yDL} + M_{yLL} = ${mdly}kNm + ${mlly}kNm = ${my}kNm   \$$`));
                    }
                } if (centricity === "eccentric"){
                document.getElementById('result').appendChild(createHeader7(`Solve Service Eccentricity`));       
                
                ey = mx / p;
                ex = my / p;
                document.getElementById('result').appendChild(createParagraph(`$$\\ e_x = \\frac {M_y}{P} = \\frac {${my}kNm}{${p}kN} = ${(ex*1000).toFixed(2)}mm   \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ e_y = \\frac {M_x}{P} = \\frac {${mx}kNm}{${p}kN} = ${(ey*1000).toFixed(2)}mm   \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B_y\\times B_x}\\times (1 + \\frac{6\\times e_x}{B_x} + \\frac{6\\times e_y}{B_y}) \$$`));
                } else if (centricity === "concentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B_y\\times B_x} \$$`));

                }
                document.getElementById('result').appendChild(createHeader7(`Solve for \\( B\\)`)); 
                if (structureType==="Isolated Square"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B^2}\\times (1 + \\frac{6\\times (e_x + e_y)}{B} \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{B^2}\\times (1 + \\frac{6\\times (${ex.toFixed(3)}m+${ey.toFixed(3)}m)}{B})  \$$`));
                    let Bx_solution = newtonRaphson(0, 0, 1,0,qnet,by,p,ex,ey);
                    console.log(`Solution for B: ${Bx_solution}`);
                    document.getElementById('result').appendChild(createParagraph(`$$\\ B = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                    bx = Math.ceil(Bx_solution*10)/10;
                    by = bx;
                } else if (structureType==="Isolated Rectangular"){
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
                    bx = Math.ceil(Bx_solution*10)/10;
                    by = Math.ceil(k*Bx_solution*10)/10;
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
                }
                document.getElementById('result').appendChild(createHeader7(`Solve for Ultimate Loads`));
                if(loadType==="ultimate"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ Pu = ${pu}kN \$$`));
                    if  (centricity === "eccentric"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux}kNm \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy}kNm   \$$`));
                    }
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
                        if  (centricity === "eccentric"){
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
                    muy = Math.max(muy1,muy2);
                    mux = Math.max(mux1,mux2);
                    euy = mux/pu;
                    eux = muy/pu;
                    con = (6*euy/by)+(6*eux/bx);
                    document.getElementById('result').appendChild(createParagraph(`$$\\ e_{ux} = \\frac{M_{uy}}{P} = \\frac{${muy.toFixed(2)}kNm}{${pu.toFixed(2)}kN} = ${(eux*1000).toFixed(2)}mm\$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ e_{uy} = \\frac{M_{ux}}{P} = \\frac{${mux.toFixed(2)}kNm}{${pu.toFixed(2)}kN} = ${(euy*1000).toFixed(2)}mm\$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ 6 \\times \\frac{e_{ux}}{B_x} + 6 \\times \\frac{e_{uy}}{B_y} \\le 1 \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ 6 \\times \\frac{${(eux*1000).toFixed(2)}mm}{${(bx*1000).toFixed(2)}mm} + 6 \\times \\frac {${(euy*1000).toFixed(2)}mm}{${(by*1000).toFixed(2)}mm} \\le 1 \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ ${con.toFixed(6)} ${con > 1 ? "> 1 \\therefore \\text{Case 1, With Tension}":"< 1 \\therefore \\text{Case 2, Without Tension}"} \$$`));
                    }
                    

                }
            } else if (recheck===1){
                if(loadType==="ultimate"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P = ${p}kN \$$`));
                    if (centricity === "eccentric"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_x = ${mx}kNm \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_y = ${my}kNm   \$$`));
                    }
                } else if (loadType==="individual"){
                    p = pdl + pll;
                    if (centricity === "eccentric"){
                    mx = mdlx + mllx;
                    my = mdly + mlly;
                }
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P = ${p}kN \$$`));
                    if (centricity === "eccentric"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_x = ${mx}kNm \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_y = ${my}kNm \$$`));
                    }
                } if (centricity === "eccentric"){
                document.getElementById('result').appendChild(createHeader7(`Solve Service Eccentricity`));       
                
                ey = my / p;
                ex = mx / p;
                document.getElementById('result').appendChild(createParagraph(`$$\\ e_x = \\frac {M_y}{P} = ${(ex*1000).toFixed(2)}mm   \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ e_y = \\frac {M_x}{P} = ${(ey*1000).toFixed(2)}mm   \$$`));
                } else if (centricity === "concentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B_y\\times B_x} \$$`));

                }
                document.getElementById('result').appendChild(createHeader7(`Solve for \\( B\\)`)); 
                if (structureType==="Isolated Square"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B^2}\\times (1 + \\frac{6\\times (e_x + e_y)}{B}) \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{B^2}\\times (1 + \\frac{6\\times (${ex.toFixed(3)}m+${ey.toFixed(3)}m)}{B})  \$$`));
                    let Bx_solution = newtonRaphson(0, 0, 1,0,qnet,by,p,ex,ey);
                    console.log(`Solution for B: ${Bx_solution}`);
                    document.getElementById('result').appendChild(createParagraph(`$$\\ B = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                    bx = Math.ceil(Bx_solution*10)/10;
                    by = bx;
                } else if (structureType==="Isolated Rectangular"){
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
                    bx = Math.ceil(Bx_solution*10)/10;
                    by = Math.ceil(k*Bx_solution*10)/10;
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
                }
                document.getElementById('result').appendChild(createHeader7(`Solve for Ultimate Loads`));
                if(loadType==="ultimate"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ Pu = ${pu}kN \$$`));
                    if  (centricity === "eccentric"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux}kNm \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy}kNm   \$$`));
                    }
                } else if (loadType==="individual"){
                    if (considerSoil==="yes"){
                        pu1 = 1.4*(pdl)+1.4*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                        pu2 = 1.2*pdl +1.6*pll + 1.2*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                        document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u} = ${Math.max(pu1,pu2).toFixed(2)}kN - GOVERN\$$`));
                        pu = Math.max(pu1,pu2); 
                    } else {
                        pu1 = 1.4*pdl;
                        pu2 = 1.2*pdl +1.6*pll;
                        
                        document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u} = ${Math.max(pu1,pu2).toFixed(2)}kN - GOVERN\$$`));
                        pu = Math.max(pu1,pu2); 
                        }

                }

            }
            function newtonRaphson(A, C, initialGuess, restrictionType, q_a_max, by, p, ex, ey, tolerance = 1e-6, maxIterations = 1000000) {
                let Bx = initialGuess; // Initial guess for Bx
                let f_Bx;
                let f_prime_Bx;
                const factor = 6 * (ex + ey);
                for (let i = 0; i < maxIterations; i++) {
                    if (structureType==="Isolated Square"){
                        // f(Bx) = (P / Bx^2) * (1 + (6 * (ex + ey) / Bx)) - qa_max
                        // f(Bx) = (P / Bx^2) * (1 + (factor / Bx)) - qa_max
                        f_Bx = (p / Math.pow(Bx, 2)) * (1 + (factor / Bx)) - q_a_max;
        
                        // f'(Bx) = -2 * (P / Bx^3) * (1 + (factor / Bx)) + (factor * P / Bx^4)
                        f_prime_Bx = (-2 * (p / Math.pow(Bx, 3))) * (1 + (factor / Bx)) + (factor * p / Math.pow(Bx, 4));


                    } else if (structureType==="Isolated Rectangular"){
                    if (restrictionType === "1" ){
                        f_Bx = A * Math.pow(Bx, 3) - Bx - C;
                        f_prime_Bx = 3 * A * Math.pow(Bx, 2) - 1;
                    } else if (restrictionType === "2"){
                        f_Bx = (q_a_max * by * Bx) - (p * (1 + (6 * ex / Bx))) - (p * 6 * ey / by);
                        f_prime_Bx = (q_a_max * by) + (p * 6 * ex / Math.pow(Bx, 2));
                    }}
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
            let vn=0;
            let dc1=0;
            console.log(`Ao = `,Ao);
            console.log(`Punching Shear Vu = `,Vu);
            document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation`));       
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - d_b = ${dc}mm - ${cc}mm - ${barDia}mm = ${d}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ A_o = (d + c_x)\\times (d + c_y) = (${d}mm + ${cx.toFixed(2)}mm)\\times (${d}mm + ${cy.toFixed(2)}mm) = ${Ao.toFixed(2)}mm^2 \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ A_f = B_y \\times B_x = ${by*1000}mm \\times ${bx*1000}mm = ${Af.toFixed(2)}mm^2 \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = P_u - P_u \\times (\\frac{A_o}{A_f} ) = ${pu}kN - ${pu}kN \\times (\\frac{${Ao.toFixed(2)}mm^2}{${Af.toFixed(2)}mm^2} ) = ${Vu.toFixed(2)}kN \$$`));
            vn = phiVn().vn;
            dc1 = phiVn().dc;
            console.log(`V,..,.h dc = `,dc1);
            function phiVn(){
               
                let vn1;
                let vn2;
                let vn3;
                
                let beta;
                let as;
                let bo;
                console.log(`Method = `,method);

                if( method === 1){
                    console.log("phivn Method 1")
                    if (cx<cy){
                        beta = cy/cx;
                        bo = (2*(d+cx))+(2*(d+cy));
                        document.getElementById('result').appendChild(createParagraph(`$$\\ \\beta = \\frac{c_y}{c_x} = \\frac{${cy.toFixed(2)}mm}{${cx.toFixed(2)}mm} = ${beta.toFixed(3)}\$$`));
                        document.getElementById('result').appendChild(createParagraph(`$$\\ B_o = [2 \\times (d + c_x)]+[2 \\times (d + c_y)] = [2 \\times (${d}mm + ${cx.toFixed(2)}mm)]+[2 \\times (${d}mm + ${cy.toFixed(2)}mm)] = ${bo.toFixed(3)}mm\$$`));
                        
                    } else if (cy<cx){
                        beta = cx/cy;
                        document.getElementById('result').appendChild(createParagraph(`$$\\ \\beta = \\frac{c_x}{c_y} = \\frac{${cx.toFixed(2)}mm}{${cy.toFixed(2)}mm} = ${beta.toFixed(3)}\$$`));
                        bo = (2*(d+cx))+(2*(d+cy));
                        document.getElementById('result').appendChild(createParagraph(`$$\\ B_o = [2 \\times (d + c_x)]+[2 \\times (d + c_y)] = [2 \\times (${d}mm + ${cx.toFixed(2)}mm)]+[2 \\times (${d}mm + ${cy.toFixed(2)}mm)] = ${bo.toFixed(3)}mm\$$`));
                       
                    } else if (cx===cy){
                        beta = 1;
                        document.getElementById('result').appendChild(createParagraph(`$$\\ \\beta = \\frac{c_y}{c_x} = \\frac{${cy.toFixed(2)}mm}{${cx.toFixed(2)}mm} = ${beta}\$$`));
                        bo = (2*(d+cx))+(2*(d+cy));
                        document.getElementById('result').appendChild(createParagraph(`$$\\ B_o = 4 \\times (d + c) = 4 \\times (${d}mm + ${cx.toFixed(2)}mm) = ${bo.toFixed(3)}mm\$$`));
                       
                    }
                    if (columnLocation===1){
                        as = 40;
                        document.getElementById('result').appendChild(createParagraph(`$$\\ a_s = ${as} ,(\\text{Interior Column})\$$`));
                    
                    } else if (columnLocation===2){
                        as = 30;
                        document.getElementById('result').appendChild(createParagraph(`$$\\ a_s = ${as} ,(\\text{Edge Column})\$$`));

                    } else if (columnLocation===3){
                        as = 20;
                        document.getElementById('result').appendChild(createParagraph(`$$\\ a_s = ${as} ,(\\text{Corner Column})\$$`));

                    }

                    vn1 = 0.75 * (1/3) * lambda * Math.sqrt(fc) *bo*d/1000;
                    vn2 = 0.75 * (1/6) * (1+(2/beta)) * lambda * Math.sqrt(fc) *bo*d/1000;
                    vn3 = 0.75 * (1/12) * (1+(as*d/bo))* lambda * Math.sqrt(fc) *bo*d/1000;
                    vn = Math.min(vn1,vn2,vn3);
                    document.getElementById('result').appendChild(createParagraph(`\\(\\phi V_n = \\phi V_c = \\text{least of}\\left\\{\\begin{array}{l}\\phi \\times \\frac {1}{3} \\times \\lambda \\times \\sqrt{fc'} \\times B_o \\times d  \\,  \\\\\\phi \\times \\frac {1}{6} \\times ( 1 + \\frac{2}{\\beta}) \\times \\lambda \\times \\sqrt{fc'} \\times B_o \\times d \\, \\\\\\phi \\times \\frac {1}{12} \\times ( 1 + \\frac{a_s \\times d}{B_o}) \\times \\lambda \\times \\sqrt{fc'} \\times B_o \\times d \\, \\end{array}\\right. \\)`));
                    document.getElementById('result').appendChild(createParagraph(``));
                    document.getElementById('result').appendChild(createParagraph(`\\(\\phi V_n = \\left\\{\\begin{array}{l}0.75 \\times \\frac {1}{3} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo}mm \\times ${d}mm = ${(vn1*1000).toFixed(2)}N \\approx ${(vn1).toFixed(2)}kN \\, \\\\0.75 \\times \\frac {1}{6} \\times (1+ \\frac{2}{${beta}}) \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo}mm \\times ${d}mm = ${(vn2*1000).toFixed(2)}N \\approx ${(vn2).toFixed(2)}kN \\, \\\\ 0.75 \\times \\frac {1}{12} \\times (1+ \\frac{${as} \\times ${d}}{${bo}}) \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo}mm \\times ${d}mm = ${(vn3*1000).toFixed(2)}N \\approx ${(vn3).toFixed(2)}kN \\, \\end{array}\\right. = ${vn.toFixed(2)}kN \\, \\)`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = ${Vu.toFixed(2)}kN ${Vu<vn ? "< \\phi V_n    \\therefore \\text{SAFE}":"> \\phi V_{n}\\therefore \\text{FAIL}"}\$$`));
                    
                    /* document.getElementById('result').appendChild(createParagraph(`$$\\phi V_{n1} = \\phi \\times \\frac {1}{3} \\times \\lambda \\times \\sqrt{fc'} \\times B_o \\times d = 0.75 \\times \\frac {1}{3} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo}mm \\times ${d}mm = ${(vn1*1000).toFixed(2)}N \\approx ${(vn1).toFixed(2)}kN\$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\phi V_{n2} = \\phi \\times \\frac {1}{6} \\times ( 1 + \\frac{2}{\\beta}) \\times \\lambda \\times \\sqrt{fc'} \\times B_o \\times d = 0.75 \\times \\frac {1}{6} \\times (1+ \\frac{2}{${beta}}) \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo}mm \\times ${d}mm = ${(vn2*1000).toFixed(2)}N \\approx ${(vn2).toFixed(2)}kN\$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\phi V_{n3} = \\phi \\times \\frac {1}{12} \\times ( 1 + \\frac{a_s \\times d}{B_o}) \\times \\lambda \\times \\sqrt{fc'} \\times B_o \\times d = 0.75 \\times \\frac {1}{12} \\times (1+ \\frac{${as} \\times ${d}}{${bo}}) \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo}mm \\times ${d}mm = ${(vn3*1000).toFixed(2)}N \\approx ${(vn3).toFixed(2)}kN\$$`));
                   */ 
                } else {
                    console.log("phivn Method 2")
                    document.getElementById('result').appendChild(createParagraph(`$$\\ V_{u} = \\phi \\times \\frac {1}{3} \\times \\lambda \\times \\sqrt{fc'} \\times (2 \\times (d + c_x) + 2 \\times (d + c_y) \\times d  \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ ${Vu.toFixed(2)}kN = 0.75 \\times \\frac {1}{3} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times (2 \\times (d + ${cx.toFixed(2)}mm) + 2 \\times (d + ${cy.toFixed(2)}mm) \\times d  \$$`));
                    d = newtonRaphson(100);
                    document.getElementById('result').appendChild(createParagraph(`$$\\ d = ${d.toFixed(2)} \\approx ${(Math.ceil(d/25)*25).toFixed(2)}\$$`));
                    dc = d + 75 + barDia;
                    document.getElementById('result').appendChild(createParagraph(`$$\\ D_c = ${d.toFixed(2)} + ${cc}mm + ${barDia}mm = ${dc.toFixed(2)}mm \\approx ${(Math.ceil(dc/25)*25).toFixed(2)}mm\$$`));
                    dc = Math.ceil(dc/25)*25;
                    console.log(`V dc method2 = `,dc);
                }
                function newtonRaphson(initialGuess, tolerance = 1e-6, maxIterations = 100000) {
                    let d = initialGuess; // Initial guess for d
                    let f_d, f_prime_d;
                
                    for (let i = 0; i < maxIterations; i++) {
                        // Calculate the function f(d)
                        f_d = 0.75 * (1 / 3) * lambda * Math.sqrt(fc) * (2 * (d + cx) + 2 * (d + cy)) * d - (Vu*1000);
                
                        // Calculate the derivative f'(d)
                        f_prime_d = 0.75 * (1 / 3) * lambda * Math.sqrt(fc) * (4 * d + 2 * (d + cx) + 2 * (d + cy));
                
                        // Newton-Raphson formula to update d
                        let next_d = d - f_d / f_prime_d;
                
                        // Check if the difference is within tolerance
                        if (Math.abs(next_d - d) < tolerance) {
                            console.log(`Converged to d = ${next_d} after ${i+1} iterations.`);
                            return next_d; // Return the result when converged
                        }
                
                        // Update d for the next iteration
                        d = next_d;
                    }
                
                    console.log(`Did not converge within the maximum number of iterations.`, d);
                    return d; // Return the last approximation if not converged
                }
                console.log(`Vm2 dc = `,dc);
                return {vn,dc} ;

            }
            
            return {dc,dc1,vn,Vu};
        }
        function beamShear(axis,dc){
            let x1;
            let x2;
            let y1;
            let y2;
            let vn;
            let longer;
            let shorter;
            let depth;
            if(bx<by){
                longer ="y";
                shorter ="x";
            } else if (bx>by){
                longer ="x";
                shorter="y";
            } 
            if(axis === "y"){
            //ACROSS X AXIS or ALONG Y AXIS
            if( longer === axis ){
                console.log(`y is longer`);
                r = 0.5;
                depth = dc - cc - (0.5*barDia);
            } else if ( shorter === axis ){
                console.log(`y is shorter`);
                depth = dc - cc - (1.5*barDia);
                r = 1.5;
            } else if ( bx === by){
                console.log(`y is equal to x`);
                depth = dc - cc - (1.5*barDia);
                r = 1.5;
            }
            
            x1 = (cx/2)+depth;      console.log(`x1 = `,x1);
            x2 = ((bx*1000)/2);            console.log(`x2 = `,x2);
            y1 = -((by*1000)/2);           console.log(`y1 = `,y1);
            y2 = (by*1000)/2;              console.log(`y2 = `,y2);
           
            document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Along Y-axis (Cut Across Y-axis)`));       
            if( longer === axis ){
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 0.5d_b = ${dc}mm - ${cc}mm - 0.5(${barDia}mm) = ${depth}mm \$$`));
            } else if ( shorter === axis ){
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
            } else {
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
            }
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {c_x}{2} + d = \\frac {${cx.toFixed(2)}mm}{2} + {${depth}mm} = ${x1.toFixed(2)}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {-B_y}{2} = \\frac {${-by*1000}mm}{2} = ${y1}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
                  
            } else if (axis === "x"){
            //ACROSS X AXIS or ALONG Y AXIS
            if( longer === axis ){
                depth = dc - cc - (0.5*barDia);
                r = 0.5;
            } else if ( shorter === axis ){
                depth = dc - cc - (1.5*barDia);
                r = 1.5;
            } else if ( bx === by){
                console.log(`y is equal to x`);
                depth = dc - cc - (0.5*barDia);
                r = 0.5;
            }
            x1 = -((bx*1000)/2);           console.log(`x1 = `,x1);
            x2 = (bx*1000)/2;              console.log(`x2 = `,x2);
            y1 = (cy/2)+depth;      console.log(`y1 = `,y1);
            y2 = ((by*1000)/2);            console.log(`y2 = `,y2);
            document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Along X-axis (Cut Across X-axis)`));       
            if( longer === axis ){
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 0.5d_b = ${dc}mm - ${cc}mm - 0.5(${barDia}mm) = ${depth}mm \$$`));
            } else if ( shorter === axis ){
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
            } else {
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 0.5d_b = ${dc}mm - ${cc}mm - 0.5(${barDia}mm) = ${depth}mm \$$`));
            }
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {-B_x}{2} = \\frac {${-bx*1000}mm}{2} = ${x1}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {c_y}{2} + d = \\frac {${cy.toFixed(2)}mm}{2} + ${depth}mm = ${y1.toFixed(2)}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
           
            }
            let a = x2 - x1;            console.log(`a = `,a);
            let b = y2 - y1;            console.log(`b = `,b);    
            let c = x2 + x1;            console.log(`c = `,c);
            let d = y2 + y1;            console.log(`d = `,d);
            let Vu = ((a*b)/(by*bx*1000*1000))*(pu+((6*c*muy)/Math.pow(bx*1000,2))+((6*d*mux)/Math.pow(by*1000,2)));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 - x_1 = ${x2.toFixed(2)}mm - (${x1.toFixed(2)})mm = ${a.toFixed(2)}mm\$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 - y_1 = ${y2.toFixed(2)}mm - (${y1.toFixed(2)})mm = ${b.toFixed(2)}mm\$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 + x_1 = ${x2.toFixed(2)}mm + (${x1.toFixed(2)})mm = ${c.toFixed(2)}mm\$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 + y_1 = ${y2.toFixed(2)}mm + (${y1.toFixed(2)})mm = ${d.toFixed(2)}mm\$$`));
            if (method === 1){
                if (axis === "x"){
                vn = phiVn(bx*1000,"B_x");
                } else if (axis === "y"){
                vn = phiVn(by*1000,"B_y"); 
                }
            } 
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\frac{(x_2 - x_1)\\times(y_2 - y_1)}{B_y \\times B_x}\\times (P_u + \\frac{6 \\times (x_2 + x_1) \\times M_{uy}}{B_x^2} + \\frac{6 \\times (y_2 + y_1) \\times M_{ux}}{B_y^2} ) \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\frac{(${a.toFixed(2)}mm)\\times(${b.toFixed(2)}mm)}{${by*1000}mm \\times ${bx*1000}mm}\\times (${pu.toFixed(2)}kN + \\frac{6 \\times (${c.toFixed(2)}mm) \\times ${muy.toFixed(2)}kNm}{(${bx*1000}mm)^2} + \\frac{6 \\times (${d.toFixed(2)}mm) \\times ${mux.toFixed(2)}kNm}{(${by*1000}mm)^2} ) \$$`));
            if (method === 1){
                document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = ${Vu.toFixed(2)}kN ${Vu<vn ? "< \\phi V_n    \\therefore \\text{SAFE}":"> \\phi V_{n}\\therefore \\text{FAIL}"}\$$`));
                
            } else if (method === 2){
                document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = ${Vu.toFixed(2)}kN\$$`));

                if (axis === "x"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\phi \\times \\frac {1}{6} \\times \\lambda \\times \\sqrt{fc'} \\times B_x \\times d \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ ${(Vu*1000).toFixed(2)}N = 0.75 \\times \\frac {1}{6} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bx*1000}mm \\times d \$$`));
                    d = newtonRaphson(100,bx*1000);  
                } else if (axis === "y"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\phi \\times \\frac {1}{6} \\times \\lambda \\times \\sqrt{fc'} \\times B_y \\times d \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ ${(Vu*1000).toFixed(2)}N = 0.75 \\times \\frac {1}{6} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bx*1000}mm \\times d \$$`));
                    d = newtonRaphson(100,by*1000);     
                }
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = ${d.toFixed(2)}mm\$$`));
                dc1 = d + 75 + (r*barDia);
                document.getElementById('result').appendChild(createParagraph(`$$\\ D_c = ${d.toFixed(2)} + ${cc}mm + (${r} \\times ${barDia}mm) = ${dc1.toFixed(2)}mm \\approx ${(Math.ceil(dc1/25)*25).toFixed(2)}mm\$$`));
                dc1 = Math.ceil(dc1/25)*25;
            }
            function phiVn(B,text){
                console.log(fc)
                let vn = 0.75 * (1/6) * lambda * Math.sqrt(fc) *B *depth/1000;
                document.getElementById('result').appendChild(createParagraph(`$$\\phi V_n = \\phi \\times \\frac {1}{6} \\times \\lambda \\times \\sqrt{fc'} \\times ${text} \\times d = 0.75 \\times \\frac {1}{6} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${B}mm \\times ${depth}mm = ${(vn*1000).toFixed(2)}N \\approx ${(vn).toFixed(2)}kN\$$`));
            
                return vn;
            }
           
            
            function newtonRaphson(initialGuess,B, tolerance = 1e-6, maxIterations = 100000000) {
                const K = 0.75 * (1/6) * lambda * Math.sqrt(fc) * B;
                console.log(`k = `,K);
                let d = initialGuess; // Initial guess for d
                let f_d, f_prime_d;
                let i = 0;
                while (i < maxIterations) {
                    // Calculate the function f(d)
                    f_d =  (Vu*1000) - K * d;
                    // Calculate the derivative f'(d)
                    f_prime_d = -K;
                    // Newton-Raphson formula to update d
                    let next_d = d - f_d / f_prime_d;
            
                    // Check if the difference is within tolerance
                    if (Math.abs(next_d - d) < tolerance) {
                        console.log(`Converged to d = ${next_d} after ${i+1} iterations.`);
                        return next_d; // Return the result when converged
                    }
                    i++;
                    // Update d for the next iteration
                    d = next_d;
                    
                }
            
                console.log("Did not converge within the maximum number of iterations.");
                return d; // Return the last approximation if not converged
            }
            console.log(`Beam Shear Vu = `,Vu);
            console.log(`Beam Shear phi Vn = `,vn);
            return {vn,Vu,d,dc1};
        }
        function rebarDesign(axis){
            console.log(100);
            let x1;
            let x2;
            let y1;
            let y2;
            let longer;
            let shorter;
            let depth;
            if(bx<by){
                longer ="y";
                shorter ="x";
            } else if (bx>by){
                longer ="x";
                shorter="y";
            } 
            console.log(200);
            if(axis === "y"){
            //ACROSS X AXIS or ALONG Y AXIS
            if( longer === axis ){
                console.log(`y is longer`);
                r = 0.5;
                depth = dc - cc - (0.5*barDia);
            } else if ( shorter === axis ){
                console.log(`y is shorter`);
                depth = dc - cc - (1.5*barDia);
                r = 1.5;
            } else if ( bx === by){
                console.log(`y is equal to x`);
                depth = dc - cc - (1.5*barDia);
                r = 1.5;
            }
            document.getElementById('result').appendChild(createHeader5(`Rebar Design Calculation Along Y-axis (Cut Across Y-axis)`));       
            
            x1 = (cx/2)+depth;             console.log(`x1 = `,x1);
            x2 = ((bx*1000)/2);            console.log(`x2 = `,x2);
            y1 = -((by*1000)/2);           console.log(`y1 = `,y1);
            y2 = (by*1000)/2;              console.log(`y2 = `,y2);
            
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {c_x}{2} + d = \\frac {${cx.toFixed(2)}mm}{2} + {${depth}mm} = ${x1.toFixed(2)}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {-B_y}{2} = \\frac {${-by*1000}mm}{2} = ${y1}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
           
            if( longer === axis ){
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 0.5d_b = ${dc}mm - ${cc}mm - 0.5(${barDia}mm) = ${depth}mm \$$`));
            } else if ( shorter === axis ){
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
            } else {
                document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
            }

            let a = x2 - x1;            console.log(`a = `,a);
            let b = y2 - y1;            console.log(`b = `,b);    
            let c = x2 + x1;            console.log(`c = `,c);
            let d = y2 + y1;            console.log(`d = `,d);
            
            console.log(`by = `,by);
            console.log(`bx = `,bx);
            console.log(`pu = `,pu);
            console.log(`muy = `,muy);
            console.log(`mux = `,mux);
            let muyShortcut = (((x2/1000)-(x1/1000))*Math.pow(((y2/1000)-(y1/1000)),2)/(2*by*bx))*(pu+(6*((x2/1000)+(x1/1000))*muy/Math.pow(bx,2))+(4*((2*y2/1000)+(y1/1000))*mux/Math.pow(by,2)));
            console.log(`Muy(shortcut) = `,muyShortcut);
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy(shortcut)} = \\frac{(x_2-x_1) \\times (y_2-y_1)^2}{2 \\times A_f} \\times (P_u + \\frac{6 \\times (x_2 + x_1 ) \\times M_{uy}}{B_x^2} + \\frac{4 \\times (2 \\times y_2 + y_1) \\times M_{ux}}{B_y^2})  \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy(shortcut)} = \\frac{(${a/1000}m) \\times (${b/1000}m)^2}{2 \\times ${by}m\\times${bx}m} \\times (${pu}kN + \\frac{6 \\times (${c/1000}m ) \\times ${muy.toFixed(2)}kNm}{(${bx}m)^2} + \\frac{4 \\times (2 \\times ${y2/1000} + (${y1/1000})) \\times ${mux.toFixed(2)}kNm}{(${by}m)^2}) = ${muyShortcut.toFixed(2)}kNm  \$$`));
            

        }
    }
        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        //GET PARAMETERS
        const structureType = document.getElementById('structureType').value;
        const restrictionType = document.getElementById('LengthRestriction').value;
        const ratioLengthL = parseFloat(document.getElementById('RatioL').value);
        const ratioLengthB = parseFloat(document.getElementById('RatioB').value); 
        const limitLength =  parseFloat(document.getElementById('Limitation').value);
        const centricity =  document.getElementById('centricity').value;
        const loadType = document.getElementById('loadType').value;
        let muy=0;
        let mux=0;
        let p=0;
        let pu=0;
        let mx=0;
        let my=0;
        let ey=0;
        let ex=0;
        let mdlx=0;
        let mdly=0;
        let mllx=0;
        let mlly=0;
        let recheck=0;
        if (loadType === "ultimate" ){
            p = parseFloat(document.getElementById('AllowableLoad').value);
            pu = parseFloat(document.getElementById('UltimateLoad').value);
            if  (centricity === "eccentric"){
                mx = parseFloat(document.getElementById('AllowableMx').value);
                my = parseFloat(document.getElementById('AllowableMy').value);
                mux = parseFloat(document.getElementById('UltimateMx').value);
                muy = parseFloat(document.getElementById('UltimateMy').value);
            }
        }
        const pdl = parseFloat(document.getElementById('DeadLoad').value);
        const pll = parseFloat(document.getElementById('LiveLoad').value);
        if  (centricity === "eccentric"){
        mdlx = parseFloat(document.getElementById('mdlx').value);
        mllx = parseFloat(document.getElementById('mllx').value);
        mdly = parseFloat(document.getElementById('mdly').value);
        mlly = parseFloat(document.getElementById('mlly').value);
    }
        const h = parseFloat(document.getElementById('Depth').value);
        const barDia = parseInt(document.getElementById('BarDiameter').value);
        const method = parseInt(document.getElementById('Method').value);
        const columnShape = document.getElementById('columnShape').value;
        let cx=0;
        let cy=0;
        if (columnShape==="square"){
            cx = parseInt(document.getElementById('ColumnWidth').value);
            cy = cx;
            document.getElementById('result').appendChild(createParagraph(`$$\\ c = ${cx}mm , \\text{Square Column} \$$`));

        } else if (columnShape==="rectangular"){
            cx = parseInt(document.getElementById('ColumnWidthX').value);
            cy = parseInt(document.getElementById('ColumnWidthY').value);
            document.getElementById('result').appendChild(createParagraph(`$$\\ c_x = ${cx}mm  \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ c_y = ${cy}mm , \\text{Rectangular Column} \$$`));
            
        } else if (columnShape==="circle"){
            cx = parseInt(document.getElementById('ColumnWidth').value)*Math.sqrt(Math.PI/4);
            cy = cx;
            document.getElementById('result').appendChild(createParagraph(`$$\\ c = ${(cx/Math.sqrt(Math.PI/4)).toFixed(0)}mm \\times \\sqrt{\\frac{\\pi}{4}} = ${cx.toFixed(2)}mm , \\text{Spiral Column} \$$`));
            
        }
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
        let dc1=0;
        let dc2=0;
        let dc3=0;
        let finalDc=0;
        let cc = 75;
        let by=0;
        let bx=0;
        let r=0;
        let calc;
        let beamShearX;
        let beamShearY;
        let punchingV;
        let euy=0;
        let eux=0;
        let con=0;
        let logic = determineMethod(structureType,loadType,columnShape,centricity,method);
        console.log(`logic: `, logic);
        calc = dimension(dc);
        
        punchingV = punchingShear ();
        
        if(method === 1){
            console.log(`Punching Vu = `,punchingV.Vu);
            console.log(`Punching Vn = `,punchingV.vn);
            while(punchingV.vn<punchingV.Vu){
                console.log("iterating Punching Shear");    
                dc+=25;
                punchingV =punchingShear ();
            }
            beamShearX=beamShear ("x",dc+25);
            beamShearY=beamShear ("y",dc+25);
            while (beamShearX.Vu>beamShearX.vn ||beamShearY.Vu>beamShearY.vn  ){
                dc += 25;
                beamShearX=beamShear ("x",dc+25);
                beamShearY=beamShear ("y",dc+25);
            }
        } else if (method === 2){
            
            beamShearX=beamShear ("x",dc+25);
            dc2=beamShearX.dc1;
            beamShearY=beamShear ("y",dc+25);
            dc3=beamShearY.dc1;
            finalDc = Math.max(punchingV.dc1,dc2,dc3);
            console.log(`dc: ${punchingV.dc1}, ${dc2}, ${dc3}  `);
            recheck += 1;
            calc = dimension(finalDc);
            rebarDesign("y");
            
        }/*
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
            console.log(`Punching Vu = `,punchingV.Vu);
            console.log(`Punching Vn = `,punchingV.vn);
            while(punchingV.vn<punchingV.Vu){
                console.log("iterating Punching Shear");    
                dc+=25;
                punchingV =punchingShear ();
            }
            beamShearX=beamShear ("x",dc1+25);
            beamShearY=beamShear ("y",dc1+25);
            while (beamShearX.Vu>beamShearX.vn ||beamShearY.Vu>beamShearY.vn  ){
                dc1 += 25;
                beamShearX=beamShear ("x",dc1+25);
                beamShearY=beamShear ("y",dc1+25);
            }
        } else if (logic === "IS-SW-SQ-EC-2") {
            // your code here
            beamShearX=beamShear ("x",dc+25);
            beamShearY=beamShear ("y",dc+25);
        } else if (logic === "IS-SW-RC-CC-1") {
            // your code here
        } else if (logic === "IS-SW-RC-CC-2") {
            // your code here
        } else if (logic === "IS-SW-RC-EC-1") {
            // your code here
            console.log(`Punching Vu = `,punchingV.Vu);
            console.log(`Punching Vn = `,punchingV.vn);
            while(punchingV.vn<punchingV.Vu){
                console.log("iterating Punching Shear");    
                dc+=25;
                punchingV =punchingShear ();
            }
            console.log("Beam Shear");
            beamShearX=beamShear ("x",dc+25);
            beamShearY=beamShear ("y",dc+25);
            while(beamShearX.vn<beamShearX.Vu || beamShearY.vn<beamShearY.Vu ){
                console.log("iterating Beam Shear"); 
                beamShearX=beamShear ("x",dc+25);
                beamShearY=beamShear ("y",dc+25);
            }
        
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
            console.log("Beam Shear");
            beamShearX=beamShear ("x",dc+25);
            beamShearY=beamShear ("y",dc+25);
            while(beamShearX.vn<beamShearX.Vu || beamShearY.vn<beamShearY.Vu ){
                console.log("iterating Beam Shear"); 
                beamShearX=beamShear ("x",dc+25);
                beamShearY=beamShear ("y",dc+25);
            }
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
        }*/
        MathJax.typeset();     
   } catch {

   }
 });


});