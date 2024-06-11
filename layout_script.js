document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("structureType").addEventListener("change", async function(event) {
        const selectedOption = event.target.value;
        try{
            if (selectedOption === 'slab') {
            window.location.href = 'slab.html';
        } else if (selectedOption === 'column') {
            window.location.href = 'column.html';
        } else if (selectedOption === 'beam') {
            window.location.href = 'beam.html';
        } else if (selectedOption === 'foundation') {
            window.location.href = 'foundation.html';
        }
    }catch (error)
        {console.error('Error loading content:', error)}
        
    });
});


