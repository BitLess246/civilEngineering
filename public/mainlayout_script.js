document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("form").addEventListener("submit", async function(event) {
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
        } else if (selectedOption === 'chb') {
            window.location.href = 'chb.html';
        } else if (selectedOption === 'boxCulvert') {
            window.location.href = 'boxCulvert.html';
        }
    }catch (error)
        {console.error('Error loading content:', error)}
        
    });
});


