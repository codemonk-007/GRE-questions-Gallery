document.addEventListener('DOMContentLoaded', () => {
    const gallery = document.getElementById('gallery');

    // 1. Fetch the manifest file
    fetch('images.json')
        .then(response => response.json())
        .then(images => {
            if (images.length === 0) {
                gallery.innerHTML = '<p>No images found. Add images to the images/ folder and update images.json.</p>';
                return;
            }

            // 2. Loop through the list and create HTML elements
            images.forEach(imageName => {
                const card = document.createElement('div');
                card.className = 'card';

                const img = document.createElement('img');
                img.src = `images/${imageName}`;
                img.alt = imageName;
                img.loading = 'lazy'; // Performance optimization

                // Click to open modal
                img.addEventListener('click', () => {
                    openModal(img.src);
                });

                card.appendChild(img);
                gallery.appendChild(card);
            });
        })
        .catch(error => {
            console.error('Error loading images:', error);
            gallery.innerHTML = '<p>Error loading images. Make sure images.json exists.</p>';
        });

    // 3. Modal Logic
    const modal = document.createElement('div');
    modal.className = 'modal';
    const modalImg = document.createElement('img');
    modal.appendChild(modalImg);
    document.body.appendChild(modal);

    function openModal(src) {
        modalImg.src = src;
        modal.classList.add('active');
    }

    modal.addEventListener('click', () => {
        modal.classList.remove('active');
    });
});
