document.addEventListener("DOMContentLoaded", function() {
    const selectElement = document.getElementById("concreteClass");
    const cementFactorLabel = document.getElementById("cementFactorLabel");
    const cementFactorInput = document.getElementById("cementFactor");

    selectElement.addEventListener("change", function() {
        if (selectElement.value === "0") {
            cementFactorLabel.style.display = "block";
            cementFactorInput.style.display = "block";
        } else {
            cementFactorLabel.style.display = "none";
            cementFactorInput.style.display = "none";
        }
    });
});
