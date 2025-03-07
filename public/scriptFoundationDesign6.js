import { SaveFile } from './script.js';

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('formFoundation').addEventListener('submit',function(event){
        event.preventDefault();
       
        

    try {
        const resultDiv = document.getElementById("result");
        resultDiv.innerHTML = ''; // Clear previous results
        const summaryDiv = document.getElementById("Summary");
        summaryDiv.innerHTML = ''; // Clear previous results
        const summary1Div = document.getElementById("Summary1");
        summary1Div.innerHTML = ''; // Clear previous results
        const parametersDiv = document.getElementById("GivenParameters1");
        parametersDiv.innerHTML = ''; // Clear previous results

    


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
    function createHeader8(content) {
        const h8 = document.createElement('h8');
        h8.innerHTML = content;
        return h8;
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
       
               
        if(recheck===0){
            document.getElementById('result').appendChild(createHeader5(`Calculation of Dimensions`));       
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_s = H - D_c = ${h*1000}mm - ${dc}mm = ${ds}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = q_{all} - (\\gamma_s \\times D_s) - (\\gamma_c \\times D_c) - q =  ${qa}kPa - (${ys}\\frac{kN}{m^3} \\times ${ds/1000}m) - (${yc}\\frac{kN}{m^3} \\times ${dc/1000}m) - ${q}kPa = ${qnet.toFixed(2)}kPa  \$$`));
            console.log(`qnet = ${qnet}`);
            document.getElementById('result').appendChild(createHeader7(`Service Load Calculation`));
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
                if (analysisMethod ==="design"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B_y\\times B_x}\\times (1 + \\frac{6\\times e_x}{B_x} + \\frac{6\\times e_y}{B_y}) \$$`));
                }
            } else if (centricity === "concentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = \\frac {P}{B_y\\times B_x} \$$`));
            }
            if (analysisMethod ==="design"){
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
                let initialGuess = 1000; 
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
                let initialGuess = 100; 
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{${by.toFixed(2)}m \\times B_x}\\times (1 + \\frac{6\\times ${ex.toFixed(3)}m}{B_x} + \\frac{6\\times ${ey.toFixed(3)}m}{${by.toFixed(2)}m}) \$$`));
                let Bx_solution = newtonRaphson(0, 0, initialGuess,"2",qnet,by,p,ex,ey);
                console.log(`Solution for B_x: ${Bx_solution}`);
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_x = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
                bx = Math.ceil(Bx_solution*10)/10;
            }
            }} else {
                qact = (p/(by*bx))*(1+(6*ex/bx)+(6*ey/by));
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{actual} = \\frac {P}{B_y\\times B_x}\\times (1 + \\frac{6\\times e_x}{B_x} + \\frac{6\\times e_y}{B_y}) \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ q_{actual} = \\frac {${p}kN}{${by}m\\times ${bx}m}\\times (1 + \\frac{6\\times ${ex}}{${bx}m} + \\frac{6\\times ${ey}m}{${by}m}) = ${qact}kPa \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qact.toFixed(3)} ${qact > qnet ? "> q_{net} \\therefore \\text{Increase Size}":"< q_{net} \\therefore \\text{SAFE}"} \$$`));

            }
            document.getElementById('result').appendChild(createHeader7(`Solve for Ultimate Loads`));
            if(loadType==="ultimate"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ Pu = ${pu.toFixed(2)}kN \$$`));
                if  (centricity === "eccentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux.toFixed(2)}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy.toFixed(2)}kNm   \$$`));
                }
            } else if (loadType==="individual"){
                if (considerSoil==="yes"){
                    pu1 = 1.4*(pdl)+1.4*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                    pu2 = 1.2*pdl +1.6*pll + 1.2*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                    document.getElementById('result').appendChild(createParagraph(``));
                    document.getElementById('result').appendChild(createParagraph(``));
                    document.getElementById('result').appendChild(createParagraph(`\\( P_u = \\text{Greatest of}\\left\\{\\begin{array}{l}1.4 \\times P_{DL} + 1.4 \\times [(\\gamma_s \\times D_s) + (\\gamma_c \\times D_c) + q] \\times B_y \\times B_x \\,  \\\\ 1.2 \\times P_{DL} + 1.6 \\times P_{LL} + 1.2 \\times [(\\gamma_s \\times D_s) + (\\gamma_c \\times D_c) + q] \\times B_y \\times B_x \\,  \\end{array}\\right. \\)`));
                    document.getElementById('result').appendChild(createParagraph(``));
                    document.getElementById('result').appendChild(createParagraph(``));

                    document.getElementById('result').appendChild(createParagraph(`\\( P_u = \\text{Greatest of}\\left\\{\\begin{array}{l}1.4 \\times ${pdl}kN + 1.4 \\times [(${ys} \\frac{kN}{m^3} \\times ${ds/1000}m) + (${yc} \\frac{kN}{m^3} \\times ${dc/1000}m) + ${q}kPa] \\times ${by}m \\times ${bx}m = ${pu1.toFixed(2)}kN \\,  \\\\  1.2 \\times ${pdl}kN + 1.6 \\times ${pll}kN + 1.2 \\times [(${ys} \\frac{kN}{m^3} \\times ${ds/1000}m) + (${yc} \\frac{kN}{m^3} \\times ${dc/1000}m) + ${q}kPa] \\times ${by}m \\times ${bx}m  = ${pu2.toFixed(2)}kN \\,  \\end{array}\\right. = ${Math.max(pu1,pu2).toFixed(2)}kN \\)`));
                    
                    pu = Math.max(pu1,pu2); 
                } else {
                    pu1 = 1.4*pdl;
                    pu2 = 1.2*pdl +1.6*pll;
                    document.getElementById('result').appendChild(createParagraph(``));
                    document.getElementById('result').appendChild(createParagraph(`\\( P_u = \\text{Greatest of}\\left\\{\\begin{array}{l}1.4 \\times P_{DL}\\ = 1.4 \\times ${pdl}kN = ${pu1.toFixed(2)}kN\\,  \\\\ 1.2 \\times P_{DL} + 1.6 \\times P_{LL} = 1.2 \\times ${pdl}kN + 1.6 \\times ${pll}kN = ${pu2.toFixed(2)}kN  \\,  \\end{array}\\right. = ${Math.max(pu1,pu2).toFixed(2)}kN \\)`));
                    
                    pu = Math.max(pu1,pu2); 
                    }
                    if  (centricity === "eccentric"){
                mux1 = 1.4*(mdlx);
                mux2 = 1.2*mdlx +1.6*mllx;
                muy1 = 1.4*(mdly);
                muy2 = 1.2*mdly +1.6*mlly;
                document.getElementById('result').appendChild(createParagraph(``));
                document.getElementById('result').appendChild(createParagraph(``));

                document.getElementById('result').appendChild(createParagraph(`\\( M_{ux} = \\text{Greatest of}\\left\\{\\begin{array}{l}1.4 \\times M_{xDL} = 1.4 \\times ${mdlx}kNm = ${mux1.toFixed(2)}kNm \\,  \\\\ 1.2 \\times M_{xDL} + 1.6 \\times M_{xLL} = 1.2 \\times ${mdlx}kNm + 1.6 \\times ${mllx}kNm = ${mux2.toFixed(2)}kNm \\,  \\end{array}\\right. = ${Math.max(mux1,mux2).toFixed(2)}kNm \\)`));
                document.getElementById('result').appendChild(createParagraph(``));
                document.getElementById('result').appendChild(createParagraph(``));

                document.getElementById('result').appendChild(createParagraph(`\\( M_{uy} = \\text{Greatest of}\\left\\{\\begin{array}{l}1.4 \\times M_{yDL} = 1.4 \\times ${mdly}kNm = ${muy1.toFixed(2)}kNm \\,  \\\\ 1.2 \\times M_{yDL} + 1.6 \\times M_{yLL} = 1.2 \\times ${mdly}kNm + 1.6 \\times ${mlly}kNm = ${muy2.toFixed(2)}kNm \\,  \\end{array}\\right. = ${Math.max(muy1,muy2).toFixed(2)}kNm \\)`));
                document.getElementById('result').appendChild(createParagraph(``));
                document.getElementById('result').appendChild(createParagraph(``));

                
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
            document.getElementById('result').appendChild(createHeader5(`Recompute Dimensions`));       
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ D_s = H - D_c = ${h*1000}mm - ${dc}mm = ${ds}mm \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ q_{net} = q_{all} - (\\gamma_s \\times D_s) - (\\gamma_c \\times D_c) - q =  ${qa}kPa - (${ys}\\frac{kN}{m^3} \\times ${ds/1000}m) - (${yc}\\frac{kN}{m^3} \\times ${dc/1000}m) - ${q}kPa = ${qnet.toFixed(2)}kPa  \$$`));
            console.log(`qnet = ${qnet}`);
            document.getElementById('result').appendChild(createHeader7(`Service Load Calculation`));
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
            
            ey = mx / p;
            ex = my / p;
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
                let initialGuess = 1000; 
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
                let initialGuess = 100; 
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${qnet.toFixed(2)}kPa = \\frac {${p}kN}{${by.toFixed(2)}m \\times B_x}\\times (1 + \\frac{6\\times ${ex.toFixed(3)}m}{B_x} + \\frac{6\\times ${ey.toFixed(3)}m}{${by.toFixed(2)}m}) \$$`));
                let Bx_solution = newtonRaphson(0, 0, initialGuess,"2",qnet,by,p,ex,ey);
                console.log(`Solution for B_x: ${Bx_solution}`);
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_x = ${(Bx_solution*1000).toFixed(2)}mm \\approx ${Math.ceil(Bx_solution*10)/10}m \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
                bx = Math.ceil(Bx_solution*10)/10;
            }
            }
            document.getElementById('result').appendChild(createHeader7(`Solve for Ultimate Load Combinations`));
            if(loadType==="ultimate"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ Pu = ${pu}kN \$$`));
                if  (centricity === "eccentric"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux.toFixed(2)}kNm \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy.toFixed(2)}kNm   \$$`));
                }
            } else if (loadType==="individual"){
                if (considerSoil==="yes"){
                    pu1 = 1.4*(pdl)+1.4*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                    pu2 = 1.2*pdl +1.6*pll + 1.2*(ys*(ds/1000)+yc*(dc/1000)+q)*bx*by;
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u} = ${Math.max(pu1,pu2).toFixed(2)}kN\$$`));
                    pu = Math.max(pu1,pu2); 
                    if (centricity === "eccentric"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux.toFixed(2)}kNm \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy.toFixed(2)}kNm   \$$`));
                    }
                } else {
                    pu1 = 1.4*pdl;
                    pu2 = 1.2*pdl +1.6*pll;
                    
                    document.getElementById('result').appendChild(createParagraph(`$$\\ P_{u} = ${Math.max(pu1,pu2).toFixed(2)}kN\$$`));
                    pu = Math.max(pu1,pu2);
                    if (centricity === "eccentric"){
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux} = ${mux.toFixed(2)}kNm \$$`));
                    document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy} = ${muy.toFixed(2)}kNm   \$$`));
                    }
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
        
           
        
        return qnet;
    }

    function punchingShear(){
        let d = dc - cc - barDia;
        let Ao = (d + cx)*(d+cy);
        let Af = (by*1000)*(bx*1000);
        let Vu = pu - pu *(Ao/Af);
        let print = "";
        let vn=0;
        let dc1=0;
        let test;
        console.log(`Ao = `,Ao);
        console.log(`Punching Shear Vu = `,Vu);
        document.getElementById('result').appendChild(createHeader5(`Punching Shear Calculation`));       
        document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - d_b = ${dc}mm - ${cc}mm - ${barDia}mm = ${d}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ A_o = (d + c_x)\\times (d + c_y) = (${d}mm + ${cx.toFixed(2)}mm)\\times (${d}mm + ${cy.toFixed(2)}mm) = ${Ao.toFixed(2)}mm^2 \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ A_f = B_y \\times B_x = ${by*1000}mm \\times ${bx*1000}mm = ${Af.toFixed(2)}mm^2 \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = P_u - P_u \\times (\\frac{A_o}{A_f} ) = ${pu.toFixed(2)}kN - ${pu.toFixed(2)}kN \\times (\\frac{${Ao.toFixed(2)}mm^2}{${Af.toFixed(2)}mm^2} ) = ${Vu.toFixed(2)}kN \$$`));
        test = phiVn();
        vn =test.vn;
        dc1 = test.dc;
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
                document.getElementById('result').appendChild(createParagraph(`\\(\\phi V_n = \\left\\{\\begin{array}{l}0.75 \\times \\frac {1}{3} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo.toFixed(2)}mm \\times ${d.toFixed(2)}mm = ${(vn1*1000).toFixed(2)}N \\approx ${(vn1).toFixed(2)}kN \\, \\\\0.75 \\times \\frac {1}{6} \\times (1+ \\frac{2}{${beta}}) \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo.toFixed(2)}mm \\times ${d.toFixed(2)}mm = ${(vn2*1000).toFixed(2)}N \\approx ${(vn2).toFixed(2)}kN \\, \\\\ 0.75 \\times \\frac {1}{12} \\times (1+ \\frac{${as} \\times ${d.toFixed(2)}}{${bo.toFixed(2)}}) \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bo.toFixed(2)}mm \\times ${d}mm = ${(vn3*1000).toFixed(2)}N \\approx ${(vn3).toFixed(2)}kN \\, \\end{array}\\right. = ${vn.toFixed(2)}kN \\, \\)`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = ${Vu.toFixed(2)}kN ${Vu<vn ? "< \\phi V_n    \\therefore \\text{SAFE}":"> \\phi V_{n}\\therefore \\text{FAIL}"}\$$`));
                
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
        
        x1 = -((bx*1000)/2);           console.log(`x1 = `,x1);
        x2 = (bx*1000)/2;              console.log(`x2 = `,x2);
        y1 = (cy/2)+depth;      console.log(`y1 = `,y1);
        y2 = ((by*1000)/2);            console.log(`y2 = `,y2);
       
        document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Along Y-axis (Cut Across Y-axis)`));       
        if( longer === axis ){
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 0.5d_b = ${dc}mm - ${cc}mm - 0.5(${barDia}mm) = ${depth}mm \$$`));
        } else if ( shorter === axis ){
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
        } else {
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
        }     
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {-B_x}{2} = \\frac {${-bx*1000}mm}{2} = ${x1}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {c_y}{2} + d = \\frac {${cy.toFixed(2)}mm}{2} + ${depth}mm = ${y1.toFixed(2)}mm \$$`));
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
        x1 = (cx/2)+depth;      console.log(`x1 = `,x1);
        x2 = ((bx*1000)/2);            console.log(`x2 = `,x2);
        y1 = -((by*1000)/2);           console.log(`y1 = `,y1);
        y2 = (by*1000)/2;              console.log(`y2 = `,y2);

        
        document.getElementById('result').appendChild(createHeader5(`Beam Shear Calculation Along X-axis (Cut Across X-axis)`));       
        if( longer === axis ){
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 0.5d_b = ${dc}mm - ${cc}mm - 0.5(${barDia}mm) = ${depth}mm \$$`));
        } else if ( shorter === axis ){
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 1.5d_b = ${dc}mm - ${cc}mm - 1.5(${barDia}mm) = ${depth}mm \$$`));
        } else {
            document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - 0.5d_b = ${dc}mm - ${cc}mm - 0.5(${barDia}mm) = ${depth}mm \$$`));
        }
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {c_x}{2} + d = \\frac {${cx.toFixed(2)}mm}{2} + {${depth}mm} = ${x1.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {-B_y}{2} = \\frac {${-by*1000}mm}{2} = ${y1}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
         
        }
        let a = x2 - x1;            console.log(`a = `,a);
        let b = y2 - y1;            console.log(`b = `,b);    
        let c = x2 + x1;            console.log(`c = `,c);
        let d = y2 + y1;            console.log(`d = `,d);
        let Vu = (Math.abs((a*b))/(by*bx*1000*1000))*(pu+((6*c*muy*1000)/Math.pow(bx*1000,2))+((6*d*mux*1000)/Math.pow(by*1000,2)));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 - x_1 = ${x2.toFixed(2)}mm - (${x1.toFixed(2)})mm = ${a.toFixed(2)}mm\$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 - y_1 = ${y2.toFixed(2)}mm - (${y1.toFixed(2)})mm = ${b.toFixed(2)}mm\$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 + x_1 = ${x2.toFixed(2)}mm + (${x1.toFixed(2)})mm = ${c.toFixed(2)}mm\$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 + y_1 = ${y2.toFixed(2)}mm + (${y1.toFixed(2)})mm = ${d.toFixed(2)}mm\$$`));
        if (method === 1){
            if (axis === "x"){
            vn = phiVn(by*1000,"B_y");
            } else if (axis === "y"){
            vn = phiVn(bx*1000,"B_x"); 
            }
        } 
        document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\frac{(x_2 - x_1)\\times(y_2 - y_1)}{B_y \\times B_x}\\times (P_u + \\frac{6 \\times (x_2 + x_1) \\times M_{uy}}{B_x^2} + \\frac{6 \\times (y_2 + y_1) \\times M_{ux}}{B_y^2} ) \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\frac{(${a.toFixed(2)}mm)\\times(${b.toFixed(2)}mm)}{${by*1000}mm \\times ${bx*1000}mm}\\times (${pu.toFixed(2)}kN + \\frac{6 \\times (${c.toFixed(2)}mm) \\times ${muy.toFixed(2)}kNm}{(${bx*1000}mm)^2} + \\frac{6 \\times (${d.toFixed(2)}mm) \\times ${mux.toFixed(2)}kNm}{(${by*1000}mm)^2} ) \$$`));
        if (method === 1){
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = ${Vu.toFixed(2)}kN ${Vu<vn ? "< \\phi V_n    \\therefore \\text{SAFE}":"> \\phi V_{n}\\therefore \\text{FAIL}"}\$$`));
            
        } else if (method === 2){
            document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = ${Vu.toFixed(2)}kN\$$`));

            if (axis === "x"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\phi \\times \\frac {1}{6} \\times \\lambda \\times \\sqrt{fc'} \\times B_y \\times d \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${(Vu*1000).toFixed(2)}N = 0.75 \\times \\frac {1}{6} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${by*1000}mm \\times d \$$`));
                d = newtonRaphson(100,by*1000);  
            } else if (axis === "y"){
                document.getElementById('result').appendChild(createParagraph(`$$\\ V_u = \\phi \\times \\frac {1}{6} \\times \\lambda \\times \\sqrt{fc'} \\times B_x \\times d \$$`));
                document.getElementById('result').appendChild(createParagraph(`$$\\ ${(Vu*1000).toFixed(2)}N = 0.75 \\times \\frac {1}{6} \\times ${lambda} \\times \\sqrt{${fc}MPa} \\times ${bx*1000}mm \\times d \$$`));
                d = newtonRaphson(100,bx*1000);     
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
        document.getElementById('result').appendChild(createHeader5(`Solve Preliminary Values for Design`));       

        let beta1 = 0;
        if ((0.85-(0.5/7)*(fc-28))>=0.85){
            beta1 = 0.85;
        } else if ((0.85-(0.5/7)*(fc-28))<0.65) {
            beta1 = 0.65;
        } else {
            beta1 = 0.85-(0.5/7)*(fc-28);
        }
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\beta_1 : 0.65 < [0.85 - (\\frac{0.05}{7})\\times (f'_c - 28)] \\le 0.85 \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\beta_1 = 0.85 - (\\frac{0.05}{7})\\times (${fc} - 28) = ${beta1.toFixed(3)} \$$`));
        
        
        if(axis === "y"){
        //ACROSS X AXIS or ALONG Y AXIS
        if( longer === axis ){
            console.log(`y is longer`);
            r = 0.5;
            depth = dc - cc - (0.5*barDia);
            level = "lower";
        } else if ( shorter === axis ){
            console.log(`y is shorter`);
            depth = dc - cc - (1.5*barDia);
            r = 1.5;
            level = "upper";
        } else if ( bx === by){
            console.log(`y is equal to x`);
            depth = dc - cc - (1.5*barDia);
            r = 1.5;
            level = "upper";
        }
        document.getElementById('result').appendChild(createHeader5(`Rebar Design Calculation Along Y-axis (Cut Across Y-axis)`));       
        
        x1 = -(bx*1000/2);             console.log(`x1 = `,x1);
        x2 = ((bx*1000)/2);            console.log(`x2 = `,x2);
        y1 = ((cy)/2);           console.log(`y1 = `,y1);
        y2 = (by*1000)/2;              console.log(`y2 = `,y2);
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {-B_x}{2} = \\frac {${-bx*1000}mm}{2} = ${x1}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {c_y}{2} = \\frac {${cy.toFixed(2)}mm}{2} = ${y1.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
       
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - ${r}d_b = ${dc}mm - ${cc}mm - ${r}(${barDia}mm) = ${depth}mm \$$`));
        

        let a = x2 - x1;            console.log(`a = `,a);
        let b = y2 - y1;            console.log(`b = `,b);    
        let c = x2 + x1;            console.log(`c = `,c);
        let d = y2 + y1;            console.log(`d = `,d);
        
        console.log(`by = `,by);
        console.log(`bx = `,bx);
        console.log(`pu = `,pu);
        console.log(`muy = `,muy);
        console.log(`mux = `,mux);
        let muyShortcut;
        if (centricity === "eccentric"){
            muyShortcut = (((x2/1000)-(x1/1000))*Math.pow(((y2/1000)-(y1/1000)),2)/(2*by*bx))*(pu+(6*((x2/1000)+(x1/1000))*muy/Math.pow(bx,2))+(4*((2*y2/1000)+(y1/1000))*mux/Math.pow(by,2)));
            console.log(`Muy(shortcut) = `,muyShortcut);
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy(shortcut)} = \\frac{(x_2-x_1) \\times (y_2-y_1)^2}{2 \\times A_f} \\times (P_u + \\frac{6 \\times (x_2 + x_1 ) \\times M_{uy}}{B_x^2} + \\frac{4 \\times (2 \\times y_2 + y_1) \\times M_{ux}}{B_y^2})  \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy(shortcut)} = \\frac{(${a/1000}m) \\times (${b.toFixed(2)/1000}m)^2}{2 \\times ${by}m\\times${bx}m} \\times (${pu}kN +  \\frac{4 \\times (2 \\times ${y2/1000}m + (${(y1/1000).toFixed(2)}m)) \\times ${mux.toFixed(2)}kNm}{(${by}m)^2}) = ${muyShortcut.toFixed(2)}kNm  \$$`));
        } else {
            muyShortcut = (((x2/1000)-(x1/1000))*Math.pow(((y2/1000)-(y1/1000)),2)/(2*by*bx))*(pu);
            console.log(`Muy(shortcut) = `,muyShortcut);
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy(shortcut)} = \\frac{(x_2-x_1) \\times (y_2-y_1)^2}{2 \\times A_f} \\times (P_u)\$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{uy(shortcut)} = \\frac{(${a/1000}m) \\times (${b.toFixed(2)/1000}m)^2}{2 \\times ${by}m\\times${bx}m} \\times (${pu}kN) = ${muyShortcut.toFixed(2)}kNm  \$$`));           
        }
        checkSRRB(bx*1000,muyShortcut,"x");

        
    } else if(axis === "x"){
        //ACROSS Y AXIS or ALONG X AXIS
        if( longer === axis ){
            console.log(`x is longer`);
            r = 0.5;
            depth = dc - cc - (0.5*barDia);
            level = "lower";
        } else if ( shorter === axis ){
            console.log(`x is shorter`);
            depth = dc - cc - (1.5*barDia);
            r = 1.5;
            level = "upper";
        } else if ( bx === by){
            console.log(`x is equal to y`);
            depth = dc - cc - (0.5*barDia);
            r = 0.5;
            level = "lower";
        }
        document.getElementById('result').appendChild(createHeader5(`Rebar Design Calculation Along X-axis (Cut Across X-axis)`));       
        
        x1 = cx/2;             console.log(`x1 = `,x1);
        x2 = ((bx*1000)/2);            console.log(`x2 = `,x2);
        y1 = -(by*1000/2);           console.log(`y1 = `,y1);
        y2 = (by*1000)/2;              console.log(`y2 = `,y2);
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_1 = \\frac {c_x}{2} = \\frac {${cx.toFixed(2)}mm}{2} = ${x1.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ x_2 = \\frac {B_x}{2} = \\frac {${bx*1000}mm}{2} = ${x2}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_1 = \\frac {-B_y}{2} = \\frac {${(-by*1000)}mm}{2} = ${y1}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ y_2 = \\frac {B_y}{2} = \\frac {${by*1000}mm}{2} = ${y2}mm\$$`));
       
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ d = D_c - C_c - ${r}d_b = ${dc}mm - ${cc}mm - ${r}(${barDia}mm) = ${depth}mm \$$`));
        

        let a = x2 - x1;            console.log(`a = `,a);
        let b = y2 - y1;            console.log(`b = `,b);    
        let c = x2 + x1;            console.log(`c = `,c);
        let d = y2 + y1;            console.log(`d = `,d);
        
        console.log(`by = `,by);
        console.log(`bx = `,bx);
        console.log(`pu = `,pu);
        console.log(`muy = `,muy);
        console.log(`mux = `,mux);
        let muxShortcut;
        if (centricity === "eccentric"){
        muxShortcut = (Math.pow(((x2/1000)-(x1/1000)),2)*((y2/1000)-(y1/1000))/(2*by*bx))*(pu+(4*((2*x2/1000)+(x1/1000))*muy/Math.pow(bx,2))+(6*((y2/1000)+(y1/1000))*mux/Math.pow(by,2)));
        console.log(`Mux(shortcut) = `,muxShortcut);
        document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux(shortcut)} = \\frac{(x_2-x_1)^2 \\times (y_2-y_1)}{2 \\times A_f} \\times (P_u + \\frac{4 \\times (2 \\times x_2 + x_1 ) \\times M_{uy}}{B_x^2} + \\frac{6 \\times (y_2 + y_1) \\times M_{ux}}{B_y^2})  \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux(shortcut)} = \\frac{(${a.toFixed(2)/1000}m)^2 \\times (${b/1000}m)}{2 \\times ${by}m\\times${bx}m} \\times (${pu}kN + \\frac{4 \\times (2 \\times ${(x2/1000).toFixed(2)}m +${(x1/1000).toFixed(2)}m) \\times ${muy.toFixed(2)}kNm}{(${bx}m)^2}) = ${muxShortcut.toFixed(2)}kNm  \$$`));
        } else {
            muxShortcut = (Math.pow(((x2/1000)-(x1/1000)),2)*((y2/1000)-(y1/1000))/(2*by*bx))*(pu) ;
            console.log(`Mux(shortcut) = `,muxShortcut);
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux(shortcut)} = \\frac{(x_2-x_1)^2 \\times (y_2-y_1)}{2 \\times A_f} \\times (P_u) \$$`));
            document.getElementById('result').appendChild(createParagraph(`$$\\ M_{ux(shortcut)} = \\frac{(${a.toFixed(2)/1000}m)^2 \\times (${b/1000}m)}{2 \\times ${by}m\\times${bx}m} \\times (${pu}kN) = ${muxShortcut.toFixed(2)}kNm  \$$`));
        
        }
        checkSRRB(by*1000,muxShortcut,"y");

        
    }
    function checkSRRB (b,mu,text){
        let ct = 3*depth/8;
        let at = ct*beta1;
        let muMax = 0.9 * 0.85 * fc * at * b *(depth-(at/2))/1000000;
        document.getElementById('result').appendChild(createHeader7(`Check if SRRB`));       
        document.getElementById('result').appendChild(createParagraph(`$$\\ c_t = 3 \\times \\frac{d}{8} = 3 \\times \\frac{${depth}}{8} = ${ct.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ a_t = \\beta_1 \\times  c_t   = ${beta1} \\times ${ct.toFixed(2)}mm = ${at.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ M_{u(max)} = \\phi \\times 0.85 \\times f'c \\times a_t \\times b \\times (d - \\frac{a_t}{2}) \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ M_{u(max)} = 0.9 \\times 0.85 \\times ${fc}MPa \\times ${at.toFixed(2)}mm \\times ${b}mm \\times (${depth}mm - \\frac{${at.toFixed(2)}mm}{2}) = ${muMax.toFixed(2)}kNm \$$`));
        
        document.getElementById('result').appendChild(createParagraph(`$$\\ M_u ${mu < muMax ? "< M_{u(max)} \\therefore \\text{ SRRB}":"> M_{u(max)} \\therefore  \\text{ DRRB}"} \$$`));
        let rn = (mu*1000000)/(0.9*b*Math.pow(depth,2));
        document.getElementById('result').appendChild(createParagraph(`$$\\ R_{n} = \\frac{M_{uy}}{\\phi B_${text} d^2} = \\frac{${(mu*1000).toFixed(2)}Nm}{${0.9}\\times  ${b}m \\times  (${depth}mm)^2}  = ${rn.toFixed(3)}\\frac{N}{mm^2} \$$`));
        let rho = 0.85 * (fc/fy)*(1-Math.sqrt(1-(2*rn/(0.85*fc))));
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\rho = 0.85 \\times (\\frac{f'c}{fy}) \\times (1- \\sqrt{1 - 2 \\times \\frac{R_n}{0.85 \\times f'c} }) = 0.85 \\times (\\frac{${fc}MPa}{${fy}MPa}) \\times (1- \\sqrt{1 - 2 \\times \\frac{${rn.toFixed(3)}MPa}{0.85 \\times ${fc}MPa} }) = ${rho.toFixed(6)} \$$`));
        let rhomin1 = 1.4/fy;
        let rhomin2 = Math.sqrt(fc)/(4*fy);
        let rhomin = Math.max(rhomin1,rhomin2);
        document.getElementById('result').appendChild(createParagraph(`\\( \\rho_{min} = \\text {Greatest of} \\left\\{\\begin{array}{l} \\frac{1.4}{fy} = \\frac{1.4}{${fy}MPa} = ${rhomin1.toFixed(6)}\\, \\\\ \\frac{f'c}{4 \\times fy} = \\frac{${fc}MPa}{4 \\times ${fy}MPa} = ${rhomin2.toFixed(6)} \\, \\end{array}\\right. = ${rhomin.toFixed(6)} \\, \\)`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\therefore \\rho = ${rho>rhomin ? rho.toFixed(6):rhomin.toFixed(6)} \$$`));
        rho = Math.max(rho,rhomin);
        let as = rho*b*depth;
        let asmin = 0.002*dc*b;
        document.getElementById('result').appendChild(createParagraph(`$$\\ A_s = \\rho \\times B_${text} \\times d = ${rho.toFixed(6)}\\times ${b}mm \\times ${depth.toFixed(2)}mm = ${as.toFixed(2)}mm^2 \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ A_{smin} = 0.002 \\times A_g = 0.002 \\times B_${text} \\times D_c =  0.002 \\times ${b}mm \\times ${dc}mm = ${asmin.toFixed(2)}mm^2  \$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\  ${as>asmin ? "A_s > A_{smin}":"A_s < A_{smin}"} \$$`));
        as = Math.max(as,asmin);
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\therefore A_s = ${as.toFixed(2)}mm^2 \$$`));
        let ab = (Math.PI/4)*Math.pow(barDia,2);
        n = as/ab;
        document.getElementById('result').appendChild(createParagraph(``));
        document.getElementById('result').appendChild(createParagraph(`$$\\ n = \\frac{A_s}{A_b} = \\frac{${as.toFixed(2)}mm}{\\frac{\\pi}{4} \\times (${barDia}mm)^2} = ${n.toFixed(2)} \\approx ${Math.ceil(n)}pcs \$$`));
        n = Math.ceil(n);
        sc = (b-150-(n*barDia))/(n-1);
        let scmin = Math.max(50,barDia,(4/3)*dAgg);
        document.getElementById('result').appendChild(createParagraph(`$$\\ S_c = \\frac{B_${text} - (2 \\times C_c) - (n \\times d_b)}{n - 1} = \\frac{${b}mm - (2 \\times 75mm) - (${n} \\times ${barDia}mm)}{${n} - 1} = ${sc.toFixed(2)}mm \$$`));
        document.getElementById('result').appendChild(createParagraph(`\\( S_{c(min)} = \\text {Greatest of} \\left\\{\\begin{array}{l} 50mm\\, \\\\  d_b = ${barDia}mm \\, \\\\  d_{agg} = ${dAgg}mm \\,\\end{array}\\right. = ${scmin}mm \\, \\)`));
        document.getElementById('result').appendChild(createParagraph(`$$\\  ${sc>scmin ? "S_c > S_{c(min)} \\therefore \\text{Okay}":"S_c < S_{c(min)} \\therefore \\text{Insufficient Spacing, add layer}"} \$$`));
        let centerbandRatio;
        let beta;
        if (by>bx){
            beta = by/bx;
        } else if (bx>by){
            beta = bx/by;
        } else {
            beta = 1;
        }
        centerbandRatio = 2 / (beta+1);
        m = Math.ceil(n*centerbandRatio);
        document.getElementById('result').appendChild(createParagraph(`$$\\ \\Upsilon_s = \\frac{2}{\\beta + 1} = \\frac{2}{${beta.toFixed(2)} + 1} = ${centerbandRatio.toFixed(2)}\$$`));
        document.getElementById('result').appendChild(createParagraph(`$$\\ n_{centerband} = n \\times \\Upsilon_s = ${n} \\times ${centerbandRatio.toFixed(2)} = ${(n*centerbandRatio).toFixed(2)}pcs \\approx ${Math.ceil(n*centerbandRatio)}pcs \$$`));
        
    }
    
    }
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    function printDiv(divId) {
        const originalContent = document.body.innerHTML;
        const printContent = document.getElementById(divId).outerHTML;

        document.body.innerHTML = printContent;
        window.print();
        document.body.innerHTML = originalContent;
    }

  window.jsPDF = window.jspdf.jsPDF;

  function generatePDF(divId) {
    const doc = new jsPDF();

    // Capture LaTeX content
    let content = document.getElementById(divId).innerHTML;

    // Add content to PDF
    doc.text(content, 10, 10);

    // Save or auto-print the PDF
    doc.save('FoundationDesign.pdf');
  }
    //GET PARAMETERS AND INITIALIZE VALUES
    document.getElementById('GivenParameters1').appendChild(createHeader5(`Parameters Given:`));       
    document.getElementById('GivenParameters1').appendChild(createHeader5(``));       
    const analysisMethod = document.getElementById('analysisMethod').value;
    let method = parseInt(document.getElementById('Method').value);
    
    


    let structureType = document.getElementById('structureType').value;
    const restrictionType = document.getElementById('LengthRestriction').value;
    const ratioLengthL = parseFloat(document.getElementById('RatioL').value);
    const ratioLengthB = parseFloat(document.getElementById('RatioB').value); 
    const limitLength =  parseFloat(document.getElementById('Limitation').value);
    const centricity =  document.getElementById('centricity').value;
    if (centricity === "concentric") {
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ Concentric \$$`));

    } else if (centricity === "eccentric") {
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ Eccentric \$$`));

    }
    let qact = 0;
    let dc=250;
    let dc1=0;
    let dc2=0;
    let dc3=0;
    let finalDc=0;
    let cc = 75;
    let by=0;
    let bx=0;
    if (analysisMethod === "analyze"){
        bx = parseFloat(document.getElementById('bx').value);
        by = parseFloat(document.getElementById('by').value);
        dc = parseFloat(document.getElementById('dc').value);
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ B_x = ${bx}m  \$$`));
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ B_y = ${by}m  \$$`));
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ D_c = ${dc}mm  \$$`));
        console.log(`0bx: `, bx);
        console.log(`0by: `, by);
        method = 1;
        if(by === bx){
            structureType = "Isolated Square";
        } else {
            structureType = "Isolated Rectangular";
        }
        console.log(`11bx: `, bx);
        console.log(`11by: `, by);
    } else {

    if (structureType==="Isolated Rectangular"){
        if (restrictionType === "1"){
                //Ratio
                document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ ${ratioLengthL}B_{y} = ${ratioLengthB}B_x  \$$`));

            }else if (restrictionType === "2"){
                //limited
                document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ B_y = ${limitLength}m  \$$`));
                document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ \$$`));
                
                
            }
    }}
    console.log(`1bx: `, bx);
    console.log(`1by: `, by);
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
    let pdl;
    let pll;
    if (loadType === "ultimate" ){
        p = parseFloat(document.getElementById('AllowableLoad').value);
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ P = ${p}kN \$$`));
        pu = parseFloat(document.getElementById('UltimateLoad').value);
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ P_{u} = ${pu}kN  \$$`));

        if  (centricity === "eccentric"){
            mx = parseFloat(document.getElementById('AllowableMx').value);
            my = parseFloat(document.getElementById('AllowableMy').value);
            mux = parseFloat(document.getElementById('UltimateMx').value);
            muy = parseFloat(document.getElementById('UltimateMy').value);
            document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{x} = ${mx}kNm  \$$`));
            document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{y} = ${my}kNm  \$$`));
            document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{ux} = ${mux}kNm \$$`));
            document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{uy} = ${muy}kNm  \$$`));

        }
    } else {
    pdl = parseFloat(document.getElementById('DeadLoad').value);
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ P_{dl} = ${pdl}kN  \$$`));

    pll = parseFloat(document.getElementById('LiveLoad').value);
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ P_{ll} = ${pll}kN  \$$`));

    if  (centricity === "eccentric"){
    mdlx = parseFloat(document.getElementById('mdlx').value);
    mllx = parseFloat(document.getElementById('mllx').value);
    mdly = parseFloat(document.getElementById('mdly').value);
    mlly = parseFloat(document.getElementById('mlly').value);
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{dlx} = ${mdlx}kNm  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{llx} = ${mllx}kNm  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{dly} = ${mdly}kNm \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ M_{lly} = ${mlly}kNm  \$$`));
}}
    const h = parseFloat(document.getElementById('Depth').value);
    const barDia = parseInt(document.getElementById('BarDiameter').value);
    const dAgg = parseInt(document.getElementById('aggDiameter').value);
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ H = ${h*1000}mm  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ d_b = ${barDia}mm  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ d_{agg} = ${dAgg}mm  \$$`));

    const columnShape = document.getElementById('columnShape').value;
    let cx=0;
    let cy=0;
    if (columnShape==="square"){
        cx = parseInt(document.getElementById('ColumnWidth').value);
        cy = cx;
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ c = ${cx}mm , \\text{Square Column} \$$`));

    } else if (columnShape==="rectangular"){
        cx = parseInt(document.getElementById('ColumnWidthX').value);
        cy = parseInt(document.getElementById('ColumnWidthY').value);
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ c_x = ${cx}mm  \$$`));
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ c_y = ${cy}mm , \\text{Rectangular Column} \$$`));
        
    } else if (columnShape==="circle"){
        cx = parseInt(document.getElementById('ColumnWidth').value)*Math.sqrt(Math.PI/4);
        cy = cx;
        document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ c = ${(cx/Math.sqrt(Math.PI/4)).toFixed(0)}mm \\times \\sqrt{\\frac{\\pi}{4}} = ${cx.toFixed(2)}mm , \\text{Spiral Column} \$$`));
        
    }
    console.log(`bx: `, bx);
    console.log(`by: `, by);
    let columnLocation = parseInt(document.getElementById('ColumnLocation').value);
    const qa = parseFloat(document.getElementById('SoilBearingCapacity').value);
    const q = parseFloat(document.getElementById('Surcharge').value);
    const lambda = parseInt(document.getElementById('λ').value);
    const fc = parseFloat(document.getElementById('fc').value);
    const fy = parseFloat(document.getElementById('fy').value);
    const ys = parseFloat(document.getElementById('UnitWeightSoil').value);
    const yc = parseFloat(document.getElementById('UnitWeightConcrete').value);
    const considerSoil = document.getElementById('considerSoil').value;
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ q_a = ${qa}kPa  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ q = ${q}kPa  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ \\lambda = ${lambda}  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ f'c = ${fc}MPa  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ fy = ${fy}MPa  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ f'c = ${fc}MPa  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ \\gamma_s = ${ys}\\frac{kN}{m^3}  \$$`));
    document.getElementById('GivenParameters1').appendChild(createHeader8(`$$\\ \\gamma_c = ${yc}\\frac{kN}{m^3}  \$$`));

    console.log(`bx: `, bx);
    console.log(`by: `, by);

    let r=0;
    let calc;
    let beamShearX;
    let beamShearY;
    let punchingV;
    let euy=0;
    let eux=0;
    let con=0;
    let m;
    let n;
    let sc;
    let level;
    //START SOLUTION
    let logic = determineMethod(structureType,loadType,columnShape,centricity,method);
    console.log(`logic: `, logic);
    console.log(`bx: `, bx);
    console.log(`by: `, by);
    calc = dimension(dc);
    console.log(`bx after: `, bx);
    console.log(`by after: `, by);
    punchingV = punchingShear ();
    
    if(method === 1){
        //ITERATION METHOD
        if (analysisMethod==="design"){
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
        recheck += 1;
        calc = dimension(dc+25);
        document.getElementById('Summary').appendChild(createHeader3(`Summary:`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ B_x = ${bx}m \$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ d_{bar} = ${barDia}mm \$$`));

        document.getElementById('Summary1').appendChild(createHeader3(`Summary:`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ B_x = ${bx}m \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ d_{bar} = ${barDia}mm \$$`));

        rebarDesign("x");
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along X-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along X-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));

        if (structureType==="Isolated Rectangular"){            
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));

        }
        rebarDesign("y");
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along Y-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along Y-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));

        if (structureType==="Isolated Rectangular"){ 
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));

        }
    } else {
        document.getElementById('Summary').appendChild(createHeader3(`Summary:`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ B_x = ${bx}m \$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ d_{bar} = ${barDia}mm \$$`));
        
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ q_{actual} = ${qact.toFixed(3)}kPa ${qact > calc ? "> ":"< "} q_{net} = ${calc.toFixed(3)}kPa ${qact > calc ? "\\therefore \\text{Increase Size}":"\\therefore \\text{SAFE}"} \$$`));
    
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ V_{u(Punching Shear)} = ${punchingV.Vu.toFixed(2)}kN \\, \\,${punchingV.Vu<punchingV.vn ? "<":">"} \\, \\, \\phi V_{n(Punching Shear)} = ${punchingV.vn.toFixed(2)}kN \\, \\, ${punchingV.Vu<punchingV.vn ? "\\therefore \\text{SAFE}":"\\therefore \\text{FAIL}"}\$$`));
        
            beamShearX=beamShear ("x",dc);
            beamShearY=beamShear ("y",dc);
          
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ V_{u(Beam Shear - x)} = ${beamShearX.Vu.toFixed(2)}kN \\, \\, ${beamShearX.Vu<beamShearX.vn ? "<":">"} \\, \\phi V_{n(Beam Shear)} = ${beamShearX.vn.toFixed(2)}kN \\, \\, ${beamShearX.Vu<beamShearX.vn ? "\\therefore \\text{SAFE}":"\\therefore \\text{FAIL}"}\$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ V_{u(Beam Shear - y)} = ${beamShearY.Vu.toFixed(2)}kN \\, \\, ${beamShearY.Vu<beamShearY.vn ? "<":">"} \\, \\phi V_{n(Beam Shear)} = ${beamShearY.vn.toFixed(2)}kN \\, \\, ${beamShearY.Vu<beamShearY.vn ? "\\therefore \\text{SAFE}":"\\therefore \\text{FAIL}"}\$$`));

         
        
        document.getElementById('Summary1').appendChild(createHeader3(`Summary:`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ B_x = ${bx}m \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ q_{actual} = ${qact.toFixed(3)}kPa ${qact > calc ? "> ":"< "} q_{net} = ${calc.toFixed(3)}kPa ${qact > calc ? "\\therefore \\text{Increase Size}":"\\therefore \\text{SAFE}"} \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ d_{bar} = ${barDia}mm \$$`));

        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ V_{u(Punching Shear)} = ${punchingV.Vu.toFixed(2)}kN \\, \\,${punchingV.Vu<punchingV.vn ? "<":">"} \\, \\, \\phi V_{n(Punching Shear)} = ${punchingV.vn.toFixed(2)}kN \\, \\, ${punchingV.Vu<punchingV.vn ? "\\therefore \\text{SAFE}":"\\therefore \\text{FAIL}"}\$$`));

        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ V_{u(Beam Shear - x)} = ${beamShearX.Vu.toFixed(2)}kN \\, \\, ${beamShearX.Vu<beamShearX.vn ? "<":">"} \\, \\phi V_{n(Beam Shear)} = ${beamShearX.vn.toFixed(2)}kN \\, \\, ${beamShearX.Vu<beamShearX.vn ? "\\therefore \\text{SAFE}":"\\therefore \\text{FAIL}"}\$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ V_{u(Beam Shear - y)} = ${beamShearY.Vu.toFixed(2)}kN \\, \\, ${beamShearY.Vu<beamShearY.vn ? "<":">"} \\, \\phi V_{n(Beam Shear)} = ${beamShearY.vn.toFixed(2)}kN \\, \\, ${beamShearY.Vu<beamShearY.vn ? "\\therefore \\text{SAFE}":"\\therefore \\text{FAIL}"}\$$`));

        rebarDesign("x");
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along X-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along X-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));

        if (structureType==="Isolated Rectangular"){            
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));

        }
        rebarDesign("y");
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along Y-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along Y-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));

        if (structureType==="Isolated Rectangular"){ 
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));

        }
        }

    } else if (method === 2){
        //APPROXIMATION METHOD
        beamShearX=beamShear ("x",dc+25);
        dc2=beamShearX.dc1;
        beamShearY=beamShear ("y",dc+25);
        dc3=beamShearY.dc1;
        finalDc = Math.max(punchingV.dc1,dc2,dc3);
        console.log(`dc: ${punchingV.dc1}, ${dc2}, ${dc3}  `);
        console.log(`final dc: ${finalDc}mm  `);
        document.getElementById('result').appendChild(createParagraph(`\\( D_c = \\text {Greatest of} \\left\\{\\begin{array}{l} ${punchingV.dc1}mm \\, \\\\ ${dc2}mm \\, \\\\ ${dc3}mm \\, \\end{array}\\right. = ${finalDc}mm \\, \\)`));
        recheck += 1;
        calc = dimension(finalDc);
        dc = finalDc;
        
        document.getElementById('Summary').appendChild(createHeader3(`Summary:`));            
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ B_x = ${bx}m \$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ d_{bar} = ${barDia}mm \$$`));

        document.getElementById('Summary').appendChild(createParagraph(`$$\\ V_{u(Punching Shear)} = ${punchingV.Vu.toFixed(2)}kN \$$`));

        document.getElementById('Summary').appendChild(createParagraph(`$$\\ V_{u(Beam Shear - x)} = ${beamShearX.Vu.toFixed(2)}kN \$$`));
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ V_{u(Beam Shear - y)} = ${beamShearY.Vu.toFixed(2)}kN \$$`));


        document.getElementById('Summary1').appendChild(createHeader3(`Summary:`));            
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ D_c = ${dc}mm \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ B_x = ${bx}m \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ B_y = ${by}m \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ d_{bar} = ${barDia}mm \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ V_{u(Punching Shear)} = ${punchingV.Vu.toFixed(2)}kN \$$`));

        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ V_{u(Beam Shear - x)} = ${beamShearX.Vu.toFixed(2)}kN \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ V_{u(Beam Shear - y)} = ${beamShearY.Vu.toFixed(2)}kN \$$`));

        
        rebarDesign("x");
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along X-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along X-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));
        
        if (structureType==="Isolated Rectangular"){ 
            document.getElementById('Summary').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));
            document.getElementById('Summary1').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));

            }
        rebarDesign("y");
        document.getElementById('Summary').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along Y-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));
        document.getElementById('Summary1').appendChild(createParagraph(`$$\\ \\text{No. of Rebars Along Y-axis (${level})} = ${n}pcs \\text{  spaced @  }${sc.toFixed(2)}mm \$$`));

        if (structureType==="Isolated Rectangular"){ 
            document.getElementById('Summary').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));
            document.getElementById('Summary1').appendChild(createParagraph(`$$\\ n_{centerband} = ${m}pcs \$$`));

            }
    }
    document.getElementById('saveButton').style.display = 'block';
    document.getElementById('tab').style.display = 'flex';
    MathJax.typesetPromise(); 
    const saveButtonElement = document.getElementById("saveButton");
    saveButtonElement.addEventListener("click", function() {
        printDiv("Solution");
        




    });  
} catch {

}

 });



});
