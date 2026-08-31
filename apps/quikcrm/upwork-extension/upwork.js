/**
 * QuikCRM API origin for the Upwork module.
 *
 * api.js (loaded by popup.html before this script) publishes API_BASE_URL on
 * window; this script is appended to that same panel document, so it reads the
 * one value rather than hardcoding a second copy that could drift. The fallback
 * only matters if api.js failed to load.
 */
const QCRM_API_BASE_URL =
  (typeof window !== "undefined" && window.API_BASE_URL) || "http://localhost:3008";

// Function to fetch groups from API
async function getSearchPageData() {
  // Get token from chrome.storage.local
  const tokens = await new Promise((resolve, reject) => {
    chrome.storage.local.get(['token'], function (result) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.token);
      }
    });
  });



  const baseUrl = 'https://lcncbackend.quikit.ai/api/backend/pages/found/searchPageId';
  const bodyData = {
    type: 'BASE',
    name: 'Upwork'
  };

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens}`
      },
      body: JSON.stringify(bodyData)
    });

    if (response.status === 401) {
      console.error('❌ Unauthorized: Access token is invalid or expired (401)');
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();


    // Filter both "Freelancer" and "Freelancer AI"
    const matchedItems = data.filter(item =>
      item.name === 'Upwork' || item.name === 'Upwork AI'
    );

    matchedItems.forEach(item => {

      sessionStorage.setItem(`${item.name.replace(/\s/g, '')}Id`, item._id);
    });

    if (matchedItems.length === 0) {

      return null;
    }

    return matchedItems.map(item => item._id);
  } catch (error) {
    console.error('❌ Error fetching data:', error);
    return null;
  }
}

async function getFreelancerPageIds() {
  const tokens = await new Promise((resolve, reject) => {
    chrome.storage.local.get(['token'], function (result) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.token);
      }
    });
  });



  const baseUrl = 'https://lcncbackend.quikit.ai/api/backend/pages/found/searchPageId';
  const bodyData = {
    type: 'BASE',
    name: ['Upwork AI']
  };

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens}`
      },
      body: JSON.stringify(bodyData)
    });

    if (response.status === 401) {
      console.error('❌ Unauthorized: Access token is invalid or expired (401)');
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();


    // Store _id in sessionStorage for matched names
    data.forEach(item => {
      if (item.name === 'Upwork' || item.name === 'Upwork AI') {
        const storageKey = `${item.name.replace(/\s/g, '')}Id`; // e.g. FreelancerId
        sessionStorage.setItem(storageKey, item._id);

      }
    });

    const ids = data.map(item => item._id);
    return ids.length > 0 ? ids : null;

  } catch (error) {
    console.error('❌ Error fetching Freelancer pages:', error);
    return null;
  }
}
// new function for group search
let selectedGroup = "";

async function getgroupSearchPageData() {
  const tokens = await new Promise((resolve, reject) => {
    chrome.storage.local.get(['token'], function (result) {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(result.token);
      }
    });
  });



  const baseUrl = 'https://lcncbackend.quikit.ai/api/backend/pages/found/searchPageId';
  const bodyData = {
    type: 'BASE',
    name: 'Group'
  };

  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens}`
      },
      body: JSON.stringify(bodyData)
    });

    if (response.status === 401) {
      console.error('❌ Unauthorized: Access token is invalid or expired (401)');
      return null;
    }

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();


    const matchedItems = data.filter(item => item.name === 'Group');

    matchedItems.forEach(item => {

      sessionStorage.setItem('GroupId', item._id);
    });

    if (matchedItems.length === 0) {

      return null;
    }

    return matchedItems.map(item => item._id);
  } catch (error) {
    console.error('❌ Error fetching group data:', error);
    return null;
  }
}

async function fetchGroups(groupId) {

  try {
    const token = await new Promise((resolve, reject) => {
      chrome.storage.local.get("token", (result) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        if (!result.token) {
          return reject(new Error("No token available!"));
        }
        resolve(result.token);
      });
    });

    // Ensure groupId is available
    if (!groupId) {
      throw new Error("GroupId is required but not provided");
    }



    const response = await fetch(
      `https://lcncbackend.quikit.ai/api/backend/form-data/${groupId}/it_crm-group-text`,
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + token,
        },
      }
    );



    if (!response.ok) {
      throw new Error("Failed to fetch groups, status: " + response.status);
    }

    const groups = await response.json();

    window.groupsData = groups;

  } catch (error) {

    // Assuming errormsg is defined elsewhere
    if (typeof errormsg === 'function') {

    }
  }
}

// Fixed example flow - properly waits and passes the groupId
async function exampleFlow() {
  try {
    const groupIds = await getgroupSearchPageData();  // Wait for GroupId to be stored

    if (groupIds && groupIds.length > 0) {
      const groupId = groupIds[0]; // Use the first groupId from the returned array


      await fetchGroups(groupId); // Pass the groupId to fetchGroups
      enableGroupSearch(); // Enable search after groups are fetched
    } else {

    }
  } catch (error) {

  }
}

// Initialize the flow
exampleFlow();

// Enable search on the group input field
function enableGroupSearch() {
  const groupSearch = document.getElementById("groupSearch");
  const groupList = document.getElementById("groupList");

  if (!groupSearch || !groupList) {

    return;
  }

  groupSearch.addEventListener("input", function (e) {
    const searchQuery = e.target.value.toLowerCase();
    groupList.innerHTML = ""; // Clear previous results

    if (searchQuery.length > 0 && window.groupsData?.length) {
      const filteredGroups = window.groupsData.filter((group) =>
        group.value.toLowerCase().includes(searchQuery)
      );

      if (filteredGroups.length > 0) {
        groupList.style.display = "block";

        filteredGroups.forEach((group) => {
          const listItem = document.createElement("li");
          listItem.textContent = group.value;

          // Add Tailwind classes
          listItem.classList.add(
            "hover:bg-gray-600",
            "cursor-pointer",
            "p-2",
            "text-gray-300"
          );

          listItem.addEventListener("click", function () {
            selectedGroup = group._id;
            groupSearch.value = group.value;
            groupList.style.display = "none";

          });

          groupList.appendChild(listItem);
        });
      } else {
        groupList.style.display = "none";
      }
    } else {
      groupList.style.display = "none";
    }
  });


}
// First, log to check if the element exists
const fetchData = document.getElementById("fetchData");
// Check if the fetchData element exists
if (fetchData) {


  fetchData.addEventListener("click", (event) => {
    event.preventDefault(); // Prevent default form submission


    // Query for the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {

      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          function: scrapeData, // The function to scrape data from the page
        },
        (results) => {


          // Hide the loader after fetching data
          if (fetchDataloader) {
            fetchDataloader.classList.add("hidden");
            fetchDataloader.classList.remove("block");
          }
          document.getElementById("upworkdata").classList.add("block");
          document.getElementById("upworkdata").classList.remove("hidden");

          if (results && results[0]?.result && results[0].result.length > 0) {
            const scrapedData = results[0].result;


            document.getElementById("jobTitle").value =
              scrapedData[0].jobTitle || "";
            document.getElementById("projectType").value =
              scrapedData[0].projectType || "";
            document.getElementById("SkillsandExpertise").value =
              scrapedData[0].SkillsandExpertise?.join(", ") || "";
            document.getElementById("projectTime").value =
              scrapedData[0].projectTimea || "";
            document.getElementById("clientLocation").value =
              scrapedData[0].clientLocation || "";
            document.getElementById("reviews").value =
              scrapedData[0].reviews || "";
            document.getElementById("jobDescription").value =
              scrapedData[0].jobDescription || "";
            document.getElementById("projectprice").value =
              scrapedData[0].cleanedRate;
            document.getElementById("proposals").value =
              scrapedData[0].JobActivity;
            document.getElementById("ConnectsValue").value =
              scrapedData[0].receivedConnects;

            // Extraction succeeded — swap the landing screen for the form. The
            // panel now opens on the landing screen instead of scraping on load,
            // so this reveal is what puts the data on screen. Field mapping
            // above is unchanged.
            const initialData = document.getElementById("intialdata");
            if (initialData) initialData.style.display = "block";

            const fetchSectionEl = document.getElementById("fetchsection");
            if (fetchSectionEl) fetchSectionEl.style.display = "none";

            const hintEl = document.querySelector("#upworkdata .sliding-warning");
            if (hintEl) hintEl.style.display = "none";
          } else {
            setTimeout(() => {
              chrome.runtime.sendMessage("closeSidePanel");
            }, 1000); // 5 seconds delay before closing

            document.getElementById("upworkdata").classList.add("hidden");
            document.getElementById("upworkdata").classList.remove("block");
            showImage(); // Call the function to display the image
          }
        }
      );
    });
  });
} else {
  console.log("fetchData element not found.");
}

// Function to show the image
function showImage() {
  const imageContainer = document.createElement("div"); // Create a container for the image
  imageContainer.classList.add("image-container"); // Optional: Add a class for styling

  // Embedding the SVG code directly

  imageContainer.innerHTML = `
<div class="flex flex-col items-center justify-center text-center p-4">
  
<svg width="298" height="247" viewBox="0 0 398 247" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M397.517 0.484375H148.408V162.566H397.517V0.484375Z" fill="white"/>
<path d="M398.001 163.051H147.924V0H398.001V163.051ZM148.892 162.081H397.033V0.969752H148.892L148.892 162.081Z" fill="#E4E4E4"/>
<path d="M257.307 16.3359C264.624 16.4613 264.622 27.3608 257.307 27.4847C249.992 27.3599 249.992 16.4613 257.307 16.3359Z" fill="#090814"/>
<path d="M272.962 16.3359C280.279 16.4613 280.278 27.3608 272.962 27.4847C265.645 27.3599 265.646 16.4613 272.962 16.3359Z" fill="white"/>
<path d="M288.618 16.3359C295.935 16.4613 295.934 27.3608 288.618 27.4847C281.301 27.3599 281.302 16.4613 288.618 16.3359Z" fill="#CACACA"/>
<path d="M241.257 59.0234H191.436V59.628H241.257V59.0234Z" fill="#CACACA"/>
<path d="M354.791 146.715H286.248V82.6094H354.791V146.715ZM286.852 146.111H354.187V83.2135H286.852L286.852 146.111Z" fill="#CACACA"/>
<path d="M286.756 82.6905L286.344 83.1328L354.277 146.605L354.689 146.163L286.756 82.6905Z" fill="#CACACA"/>
<path d="M354.275 82.7151L286.342 146.188L286.754 146.63L354.687 83.1574L354.275 82.7151Z" fill="#CACACA"/>
<path d="M354.79 50.556H191.133V39.3672H354.79V50.556ZM191.737 49.9514H354.186V39.9722H191.737V49.9514Z" fill="#CACACA"/>
<path d="M251.665 100.009H191.617V88.8203H251.665V100.009ZM192.221 99.4045H251.062V89.4253H192.221V99.4045Z" fill="#CACACA"/>
<path d="M251.665 118.915H191.617V107.727H251.665V118.915ZM192.221 118.311H251.062V108.332H192.221V118.311Z" fill="#CACACA"/>
<path d="M251.665 137.829H191.617V126.641H251.665V137.829ZM192.221 137.225H251.062V127.246H192.221V137.225Z" fill="#CACACA"/>
<path d="M207.344 72.8865H191.238C192.482 67.8761 192.331 62.4555 191.238 56.7578H207.344C206.228 59.2997 205.653 62.0458 205.653 64.8222C205.653 67.5985 206.229 70.3446 207.344 72.8865Z" fill="white"/>
<path d="M203.439 60.1797H193.678V62.1349H203.439V60.1797Z" fill="white"/>
<path d="M203.439 64.0859H193.678V66.0412H203.439V64.0859Z" fill="white"/>
<path d="M203.439 68H193.678V69.9552H203.439V68Z" fill="white"/>
<path d="M328.627 97.2459H312.521C313.765 92.2354 313.615 86.8149 312.521 81.1172H328.627C327.512 83.6591 326.936 86.4052 326.936 89.1815C326.936 91.9579 327.512 94.704 328.627 97.2459H328.627Z" fill="white"/>
<path d="M324.724 84.5312H314.963V86.4865H324.724V84.5312Z" fill="white"/>
<path d="M324.724 88.4453H314.963V90.4005H324.724V88.4453Z" fill="white"/>
<path d="M324.724 92.3516H314.963V94.3068H324.724V92.3516Z" fill="white"/>
<path d="M349.334 62.6834H333.229C334.472 57.6729 334.322 52.2524 333.229 46.5547H349.334C348.219 49.0966 347.643 51.8427 347.643 54.619C347.643 57.3954 348.219 60.1415 349.334 62.6834Z" fill="white"/>
<path d="M345.431 49.9688H335.67V51.924H345.431V49.9688Z" fill="white"/>
<path d="M345.431 53.8828H335.67V55.838H345.431V53.8828Z" fill="white"/>
<path d="M345.431 57.7891H335.67V59.7443H345.431V57.7891Z" fill="white"/>
<path d="M67.0265 75.3025H39.4299V60.5146C39.4195 58.6933 39.7688 56.8879 40.4576 55.2023C41.1464 53.5167 42.1611 51.984 43.4434 50.6925C44.7257 49.4009 46.2503 48.376 47.9296 47.6766C49.6088 46.9772 51.4095 46.6172 53.2282 46.6172C55.0469 46.6172 56.8476 46.9772 58.5268 47.6766C60.206 48.376 61.7307 49.4009 63.013 50.6925C64.2953 51.984 65.31 53.5167 65.9988 55.2023C66.6876 56.8879 67.0368 58.6933 67.0265 60.5146V75.3025Z" fill="#303030"/>
<path d="M78.8818 238.938H85.2192L88.2364 216.008H78.8809L78.8818 238.938Z" fill="#FFB6B6"/>
<path d="M3.40819 233.242L11.1263 235.199L28.4433 214.596L17.0519 211.707L3.40819 233.242Z" fill="#FFB6B6"/>
<path d="M59.7289 68.5588C59.7289 68.5588 56.5074 75.8341 58.2473 77.4362C59.9871 79.0383 47.3597 80.8619 47.3597 80.8619C47.3597 80.8619 47.8918 70.8631 47.0188 68.7022L59.7289 68.5588Z" fill="#FFB9B9"/>
<path d="M46.3252 135.327L45.8673 137.563C45.8673 137.563 44.493 138.905 45.1802 139.576C45.8673 140.246 45.6381 143.377 45.6381 143.377C45.2537 149.085 37.6142 181.163 36.248 187.428C36.248 187.428 25.7129 194.136 17.4679 207.329C9.22288 220.522 8.99414 223.876 8.99414 223.876L18.155 227.678L41.0574 200.621C41.0574 200.621 47.4712 196.82 49.7586 193.465C52.046 190.111 66.2486 155.452 66.2486 155.452L74.2645 191.676C74.2645 191.676 73.8065 204.869 75.8674 213.367C77.1342 218.725 77.9009 224.19 78.1575 229.69L88.9219 228.572C88.9219 228.572 88.2347 196.82 87.0897 193.466C87.0897 193.466 91.8991 154.781 82.2803 139.352L74.53 119.173L66.9375 116.32L46.3252 135.327Z" fill="#090814"/>
<path d="M53.0849 50.3047C67.5355 50.5517 67.5333 72.0781 53.0849 72.3233C38.6347 72.0758 38.6369 50.5495 53.0849 50.3047Z" fill="#FFB8B8"/>
<path d="M64.2064 60.7492H61.7503L61.0816 59.0747L61.4162 60.7492H47.9836L48.4209 57.2457L45.1558 60.7492H41.8987V58.8505C41.8893 57.3777 42.171 55.9176 42.7273 54.5541C43.2837 53.1907 44.1038 51.9509 45.1404 50.9062C46.1771 49.8614 47.4098 49.0323 48.7677 48.4665C50.1256 47.9007 51.5818 47.6094 53.0525 47.6094C54.5232 47.6094 55.9794 47.9007 57.3373 48.4665C58.6952 49.0323 59.9279 49.8614 60.9646 50.9062C62.0012 51.9509 62.8214 53.1907 63.3777 54.5541C63.9341 55.9176 64.2157 57.3777 64.2064 58.8505V60.7492Z" fill="#303030"/>
<path d="M67.9863 77.8594L40.6777 78.0808L46.4496 136.707C46.4496 136.707 78.3838 135.019 78.4035 125.257L75.4119 116.583L67.9863 77.8594Z" fill="#E6E6E6"/>
<path d="M118.809 180.153L23.6125 199.896C22.6392 200.095 21.5161 198.644 21.1008 196.649L11.099 148.262C10.6868 146.268 11.1438 144.489 12.1149 144.284L107.31 124.542C108.283 124.342 109.406 125.794 109.821 127.788L119.827 176.175C120.236 178.17 119.78 179.95 118.809 180.153Z" fill="white"/>
<path d="M46.6906 165.605C51.3856 165.605 55.1917 161.794 55.1917 157.092C55.1917 152.39 51.3856 148.578 46.6906 148.578C41.9955 148.578 38.1895 152.39 38.1895 157.092C38.1895 161.794 41.9955 165.605 46.6906 165.605Z" fill="#F0F0F0"/>
<path d="M78.1047 177.368L37.2685 185.837C37.2174 185.849 37.1655 185.855 37.1133 185.857L49.4999 148.351C49.5745 148.118 49.7096 147.909 49.8914 147.745C50.0732 147.581 50.2951 147.469 50.5345 147.419C50.7739 147.37 51.0222 147.385 51.254 147.463C51.4858 147.54 51.6927 147.679 51.8537 147.863L69.4645 167.657L70.3082 168.604L78.1047 177.368Z" fill="#E4E4E4"/>
<path d="M100.843 172.657L65.5234 179.982L70.3086 168.607L70.6526 167.788L76.887 152.966C77.0037 152.735 77.1676 152.531 77.3681 152.367C77.5686 152.204 77.8012 152.085 78.0508 152.017C78.3003 151.949 78.5613 151.935 78.8167 151.975C79.0721 152.015 79.3162 152.109 79.5332 152.25C79.5898 152.291 79.6438 152.336 79.6947 152.384L100.843 172.657Z" fill="#E4E4E4"/>
<path d="M118.809 180.153L23.6125 199.896C22.6392 200.095 21.5161 198.644 21.1008 196.649L11.099 148.262C10.6868 146.268 11.1438 144.489 12.1149 144.284L107.31 124.542C108.283 124.342 109.406 125.794 109.821 127.788L119.827 176.175C120.236 178.17 119.78 179.95 118.809 180.153ZM12.4131 145.729C11.83 145.851 11.5569 146.92 11.8036 148.116L21.809 196.502C22.0566 197.699 22.7307 198.569 23.3151 198.451L118.51 178.708C119.093 178.587 119.366 177.518 119.119 176.321L109.114 127.935C108.866 126.739 108.192 125.869 107.608 125.987L12.4131 145.729Z" fill="#CACACA"/>
<path d="M90.6445 135.371C90.0436 135.089 89.5119 134.678 89.0868 134.167C88.6617 133.657 88.3535 133.059 88.184 132.417C88.0144 131.774 87.9876 131.102 88.1055 130.448C88.2233 129.794 88.483 129.173 88.8661 128.631L83.3359 119.841L87.8502 115.172L95.4857 127.696C96.3532 128.401 96.9324 129.4 97.1136 130.504C97.2947 131.608 97.0652 132.74 96.4685 133.686C95.8719 134.632 94.9495 135.326 93.8761 135.637C92.8027 135.947 91.6529 135.853 90.6445 135.371Z" fill="#FFB6B6"/>
<path d="M63.791 80.1693L67.7527 77.5547C67.7527 77.5547 70.8098 78.241 74.062 84.5047C77.3141 90.7683 90.4269 118.77 90.4269 118.77L85.0371 124.25L70.6582 102.282L63.791 80.1693Z" fill="#E6E6E6"/>
<path d="M39.5079 142.374C39.9276 141.859 40.2293 141.258 40.392 140.614C40.5546 139.969 40.5742 139.297 40.4493 138.644C40.3245 137.991 40.0582 137.374 39.6693 136.835C39.2803 136.297 38.7782 135.85 38.1983 135.527L39.385 125.205L33.2978 122.953L31.8267 137.551C31.3491 138.563 31.2586 139.715 31.5724 140.789C31.8862 141.863 32.5825 142.784 33.5294 143.378C34.4762 143.973 35.6079 144.198 36.7098 144.013C37.8118 143.827 38.8076 143.244 39.5084 142.372L39.5079 142.374Z" fill="#FFB6B6"/>
<path d="M44.2712 83.1256L40.6781 78.095C40.6781 78.095 38.2194 77.5483 35.3143 80.9422C32.4093 84.3361 30.7148 126.761 30.7148 126.761L41.3661 129.187L47.6601 99.1254L44.2712 83.1256Z" fill="#E6E6E6"/>
<path d="M33.2592 157.097L17.5052 160.447C17.6823 155.287 16.4112 150.016 14.1602 144.67L29.9142 141.32C29.3506 144.039 29.3569 146.845 29.9328 149.561C30.5086 152.276 31.6413 154.843 33.2592 157.097Z" fill="white"/>
<path d="M26.804 145.478L17.2559 147.508L17.6613 149.42L27.2095 147.39L26.804 145.478Z" fill="white"/>
<path d="M27.6146 149.298L18.0664 151.328L18.4719 153.241L28.02 151.211L27.6146 149.298Z" fill="white"/>
<path d="M28.4251 153.126L18.877 155.156L19.2824 157.069L28.8306 155.039L28.4251 153.126Z" fill="white"/>
<path d="M93.6177 244.346C94.3954 244.346 95.0884 244.328 95.6118 244.278C97.5776 244.099 99.4547 242.643 100.399 241.793C100.605 241.607 100.749 241.361 100.81 241.089C100.871 240.818 100.846 240.534 100.738 240.277C100.661 240.092 100.543 239.927 100.393 239.794C100.243 239.661 100.065 239.563 99.8722 239.509L94.6753 238.021L86.2603 232.336L86.1648 232.506C85.7065 233.322 85.3254 234.179 85.0265 235.066C84.9708 235.221 84.9492 235.385 84.9631 235.549C84.977 235.713 85.0262 235.872 85.1072 236.015C85.2032 236.158 85.3381 236.271 85.496 236.34C85.344 236.5 84.8681 236.825 83.3961 237.059C81.25 237.399 80.7974 235.172 80.7799 235.08L80.7656 235.005L80.7019 234.963C79.6802 234.304 79.0509 234.003 78.8352 234.067C78.7006 234.106 78.4764 234.177 77.8628 240.242C77.5665 241.185 77.4987 242.186 77.665 243.161C77.979 244.613 84.3151 244.114 85.5844 244C85.6198 244.004 90.3642 244.344 93.6128 244.344H93.6164L93.6177 244.346Z" fill="#303030"/>
<path d="M15.3541 243.845C16.0809 244.184 16.7364 244.471 17.2468 244.653C19.1621 245.344 21.5445 244.815 22.793 244.44C23.0654 244.359 23.3056 244.194 23.4797 243.969C23.6538 243.744 23.753 243.469 23.7636 243.185C23.7709 242.979 23.7316 242.774 23.6488 242.585C23.566 242.396 23.4417 242.229 23.2852 242.095L19.0689 238.449L15.5582 229.94L15.3958 230.056C15.3354 230.1 13.7014 231.022 13.0099 231.833C12.8913 231.952 12.8 232.095 12.7424 232.253C12.6849 232.411 12.6625 232.58 12.6767 232.747C12.7048 232.922 12.7821 233.086 12.8997 233.218C11.5614 233.192 10.2318 232.996 8.94267 232.635C6.79011 232.013 7.32781 229.753 7.35019 229.661L7.36881 229.586L7.32842 229.517C6.65789 228.461 6.19754 227.907 5.97006 227.873C5.82759 227.851 5.58569 227.817 2.39816 233.168C1.7141 233.912 1.21864 234.811 0.953463 235.787C0.622248 237.268 6.75836 239.572 7.99381 240.021C8.02522 240.039 12.3135 242.425 15.3504 243.843L15.3537 243.845L15.3541 243.845Z" fill="#303030"/>
</svg>
     
  <p class="text-xl text-white font-bold text-center mt-2">
Please go to valid project page and restart extension.
</p>


</div>`;

  document.body.appendChild(imageContainer); // Add the container to the body (or any other specific element)
}

// Panel bootstrap.
//
// The auto-click on #fetchData that used to live here has been REMOVED: the
// panel now opens on a landing screen ("Extract Job Data") and scrapes only when
// the user asks, matching the LinkedIn extension. Everything else below is the
// same setup that always ran on load — the group typeahead, the save handler and
// the CRM page-id lookups all still initialise immediately, so the extraction
// itself is unchanged when it does run.
if (fetchData) {
  fetchGroups();
  enableGroupSearch();
  handleSaveClick();
  getSearchPageData();
  getgroupSearchPageData();
  getFreelancerPageIds();
} else {
  console.log("fetchData element not found at the time of setup.");
}

/**
 * Swap the scraped-data form out for the AI results panel.
 *
 * Called only when there is something to show in #AI. Previously this ran on
 * the Add-to-CRM click, which required a placeholder loader to occupy the empty
 * panel; the loader is gone, so the swap is deferred to render time instead.
 */
function showAiPanel() {
  const upworkData = document.getElementById("upworkdata");
  if (upworkData) {
    upworkData.classList.add("hidden");
    upworkData.classList.remove("block");
  }

  const aiElement = document.getElementById("AI");
  if (aiElement) {
    aiElement.classList.add("visible");
    aiElement.classList.remove("hidden");
  }
}

function handleSaveClick() {
  const saveButton = document.getElementById("save");

  if (!saveButton) {
    console.error("Save button not found!");
    return;
  }

  saveButton.addEventListener("click", async () => {
    // The scraped-data form and the #AI panel are NOT switched here any more.
    //
    // They used to be: the form was hidden and the (still empty) #AI panel was
    // revealed the instant the button was clicked, which is why a full-screen
    // "Wait for AI response..." loader had to be injected to fill it. With that
    // loader gone, switching early would leave the user staring at a blank
    // panel. The swap now happens only once the AI results are ready to render
    // (see showAiPanel), so the user stays on the normal UI until then and just
    // gets the "Added to CRM successfully." toast.

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          function: retrunFunction,
          args: [3],
        },
        async (results) => {
          if (
            !results ||
            results.length === 0 ||
            results[0].result !== "SaveData"
          ) {
            console.error("Unexpected results from executeScript:", results);
            return;
          }

          // The job URL of the tab we scraped. This is the unique identifier the
          // Upwork module dedupes on, and the "Open on Upwork" link in the CRM.
          const upworkJobUrl = tabs[0]?.url || null;

          chrome.storage.local.get(null, async (localData) => {
            console.log(
              "document.getElementById received ConnectsValue:",
              document.getElementById("ConnectsValue").value
            );

            // QuikCRM Upwork module payload. Replaces the old QuikFetch
            // lcncbackend form-data POST (opaque `it_crm-pipeline-*` keys against
            // a low-code page id). Fields are sent as scraped — the API stores
            // them verbatim.
            const selectedOrg = localData.selectedOrganization;
            const datatopost = {
              orgId: selectedOrg && selectedOrg.id ? selectedOrg.id : undefined,
              jobUrl: upworkJobUrl,
              jobTitle: document.getElementById("jobTitle").value,
              jobDescription: document.getElementById("jobDescription").value,
              projectPrice: document.getElementById("projectprice").value,
              projectType: document.getElementById("projectType").value,
              skills: document.getElementById("SkillsandExpertise").value,
              reviews: document.getElementById("reviews").value,
              clientLocation: document.getElementById("clientLocation").value,
              proposals: document.getElementById("proposals").value,
              projectTime: document.getElementById("projectTime").value,
              requiredConnects: document.getElementById("ConnectsValue").value,
            };

            console.log("Result from executeScript:", results[0].result);
            var tokens = localData.token;

            const apiUrl = `${QCRM_API_BASE_URL}/api/upwork`;

            let clientRequirementPayload = {
              client_requirements: {
                job_title: document.getElementById("jobTitle").value,
                job_description:
                  document.getElementById("jobDescription").value,
                project_price: document.getElementById("projectprice").value,
                project_type: document.getElementById("projectType").value,
                skills_and_expertise:
                  document.getElementById("SkillsandExpertise").value,
                reviews: document.getElementById("reviews").value,
                client_location:
                  document.getElementById("clientLocation").value,
                proposals: document.getElementById("proposals").value,
                project_time: document.getElementById("projectTime").value,
                connects_value: document.getElementById("ConnectsValue").value,
              },
            };

            // Second API request
            const apiUrl2 = "https://salesmy.moreyeahs.in/api/extract";

            const apiUrl3 = "https://salesmy.moreyeahs.in/api/generate_message";

            try {
              // NOTE: the full-screen "Wait for AI response..." loader (and its
              // Skip button) used to be injected here. Removed — the save is
              // fast and the success toast is the only feedback needed, so the
              // user now stays on the normal panel UI throughout. The AI chain
              // below still runs; it simply no longer blocks the view.

              const response = await fetch(apiUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: "Bearer " + tokens,
                },
                body: JSON.stringify(datatopost),
              });

              const body = await response.json().catch(() => null);

              // The QuikCRM API answers { success, data: { job, duplicate } }.
              // A duplicate is a 200, not an error — the job is already in the
              // CRM, which is a successful outcome for the user.
              if (!response.ok || !body || body.success === false) {
                const message =
                  (body && body.error) ||
                  (response.status === 401
                    ? "Session expired. Please sign in again."
                    : "Could not save to QuikCRM.");
                errormsg(message);
                throw new Error(message);
              }

              const savedJob = body.data && body.data.job;
              const isDuplicate = !!(body.data && body.data.duplicate);
              const data = savedJob;

              // Confirm the save AS SOON AS the CRM write returns, not after the
              // AI chain below. The loader used to cover that gap; without it,
              // waiting for two more network calls would leave the click with no
              // feedback at all. The AI step is optional and its failures are
              // swallowed, so it must never gate the success message.
              if (data) {
                sucessmsg(
                  isDuplicate
                    ? "Already in CRM — opening the existing record."
                    : "Added to CRM successfully."
                );
              }

              try {
                const response2 = await fetch(apiUrl2, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    // Authorization: "Bearer " + tokens,
                  },
                  body: JSON.stringify(clientRequirementPayload),
                });

                // Handling the response from the second API
                const data2 = await response2.json();


                try {
                  const response3 = await fetch(apiUrl3, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: "Bearer " + tokens,
                    },
                    body: JSON.stringify(data2),
                  });

                  const data3 = await response3.json();
                  chrome.storage.local.set(
                    { apiResponse3: data3 },
                    function () {

                    }
                  );


                  const ele = document.getElementById("alo");
                  ele.innerHTML = "";

                  async function getData() {
                    var data45 = "";

                    // Convert the chrome storage call into a promise
                    const result = await new Promise((resolve, reject) => {
                      chrome.storage.local.get(
                        "apiResponse3",
                        function (result) {
                          if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                          } else {
                            resolve(result);
                          }
                        }
                      );
                    });

                    data45 = result.apiResponse3;

                    // Log the data after it's been set

                    return data45;
                  }
                  function parseJwt(token) {
                    try {
                      const base64Url = token.split(".")[1]; // Get the payload
                      const base64 = base64Url
                        .replace(/-/g, "+")
                        .replace(/_/g, "/");
                      const jsonPayload = decodeURIComponent(
                        atob(base64)
                          .split("")
                          .map(
                            (c) =>
                              "%" +
                              ("00" + c.charCodeAt(0).toString(16)).slice(-2)
                          )
                          .join("")
                      );

                      return JSON.parse(jsonPayload);
                    } catch (e) {
                      console.error("Invalid JWT", e);
                      return null;
                    }
                  }
                  // Persist the AI chain's output ONTO the Upwork job row that
                  // "Add to CRM" just created, via the QuikCRM Upwork module.
                  // Replaces the old second lcncbackend form-data POST, which
                  // filed the AI result as a separate low-code record against
                  // `UpworkAIId` (and, per the README, read the WRONG session
                  // key — it used UpworkId, so the AI record was mis-filed).
                  // One job = one row, with its analysis attached.
                  const check = async () => {
                    const resposnse = await getData();
                    const customtext =
                      document.getElementById("customMessege").value;

                    if (!savedJob || !savedJob.id) {
                      errormsg("Save the job to CRM first.");
                      return;
                    }

                    try {
                      const aiRes = await fetch(
                        `${QCRM_API_BASE_URL}/api/upwork/${savedJob.id}/ai-analysis`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            Authorization: "Bearer " + tokens,
                          },
                          body: JSON.stringify({
                            // Opaque to the API — stored as-is so a change in the
                            // AI service's response shape needs no migration.
                            analysis: {
                              match_percentages: resposnse.match_percentages,
                              feedback: resposnse.feedback,
                              suggested_client_message: resposnse.client_message,
                            },
                            score: resposnse.score,
                            confidence: resposnse.confidence,
                            // What the USER wrote, kept distinct from the
                            // AI-suggested message inside `analysis`.
                            clientMessage: customtext,
                          }),
                        }
                      );
                      const aiBody = await aiRes.json().catch(() => null);
                      if (!aiRes.ok || !aiBody || aiBody.success === false) {
                        throw new Error(
                          (aiBody && aiBody.error) || "Could not save AI analysis."
                        );
                      }
                      sucessmsg("AI analysis saved to CRM.");
                    } catch (err) {
                      // The job itself is already saved — only the annotation
                      // failed, so say that rather than implying data was lost.
                      console.error("[QuikCRM] AI analysis save failed", err);
                      errormsg(
                        (err && err.message) || "Could not save AI analysis."
                      );
                      return;
                    }

                    setTimeout(() => {
                      chrome.runtime.sendMessage("closeSidePanel");
                    }, 1000);
                  };

                  const div = document.createElement("div");
                  // Assuming each item has 'title' and 'description' properties
                  div.innerHTML = `
                  <h1><b><u>Matched Percentages</u></b></h1>
                 <table class="matched-percentages">
    <tr>
      <th>Description</th>
      <td>${data3.match_percentages.description}</td>
    </tr>
    <tr>
      <th>Industry</th>
      <td>${data3.match_percentages.industry}</td>
    </tr>
    <tr>
      <th>Pain Point</th>
      <td>${data3.match_percentages.pain_points}</td>
    </tr>
    <tr>
      <th>Roles</th>
      <td>${data3.match_percentages.roles}</td>
    </tr>
    <tr>
      <th>Skills</th>
      <td>${data3.match_percentages.skills}</td>
    </tr>
    <tr>
      <th>Technology</th>
      <td>${data3.match_percentages.technology}</td>
    </tr>
     <tr>
      <th>Score</th>
      <td>${data3.score}</td>
    </tr>
     <tr>
      <th>AI Respond</th>
      <td>${data3.confidence}</td>
    </tr>
    </table>
                
     <div class="feedback">
    <h3>FeedBack AI</h3>
    <textarea placeholder="Type your message to the client here...">${data3.feedback}</textarea>
  </div>
    <div class="box">
                    <h3>Generate Message to Client AI</h3>
                    <textarea placeholder="Type your message to the client here...">${data3.client_message}</textarea>
                  </div>

                  <div class="box">
                    <h3>Message to Client</h3>
                    <textarea placeholder="Type your message to the client here..." id="customMessege" required ></textarea>
                  </div>
                  <div style="text-align: center;">
                    <button id="handleSave" onclick="check()" style="background-color:rgb(241, 238, 235); color:#000000; padding: 10px 55px; border: none; border-radius: 5px; cursor: pointer; font-size:1em; font-weight:500;">Save</button>
                  </div>

                  <style>
                    body {
                      font-family: Arial, sans-serif;
                      background-color: #f4f4f4;
                      color: #333;
                      margin: 0;
                      padding: 20px;
                    }

                  h1 {
  text-align: center;
  color: rgb(243, 248, 243);
  font-size: 2rem;
}


                    h2 {
                      font-size: 1.2rem;
                       color:rgb(244, 247, 244);
                    }
 h3 {
                      font-size: 1.2rem;
                       color:rgb(3, 8, 3);
                    }
                    .box {
                      background-color: #fff;
                      padding: 10px;
                      margin-bottom: 20px;
                      border-radius: 10px;
                      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                    }
.feedback {
      background-color: #fff;
      padding: 6px;
      margin-bottom: 20px;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
                  .matched-percentages {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
     
      color: #fff; /* White text for the table */
    }

    .matched-percentages th, .matched-percentages td {
      padding: 10px;
      border: 2px solid #ccc;
      text-align: left;
      background-color: transparent; /* Set background to transparent */
    }

    .matched-percentages th {
      font-weight: bold;
  
      }
                    textarea {
                      color:#000000;    
                      width: 100%;
                      padding: 10px;
                      font-size: 1rem;
                      border: 1px solid #ccc;
                      border-radius: 5px;
                      resize: none;
                      height:250px
                    }
                 
      .feedback textarea {
      height: 125px;
    }
                    </style>
                `;
                  ele.appendChild(div);
                  // Results are in the DOM — now it is worth swapping the form
                  // out for the AI panel (previously done on click, which is
                  // what the removed loader was covering for).
                  showAiPanel();

                  document
                    .getElementById("handleSave")
                    .addEventListener("click", check);

                  const newData = document.getElementById("handleSave");

                } catch (error) {

                }
              } catch (error) {

              }
              if (data) {
                // Success toast already fired right after the CRM write above.
                // Reset form fields
                [
                  "jobTitle",
                  "jobDescription",
                  "projectprice",
                  "SkillsandExpertise",
                  "reviews",
                  "clientLocation",
                  "proposals",
                  "projectTime",
                  "projectType",
                  "ConnectsValue",
                ].forEach((id) => (document.getElementById(id).value = ""));

                // Close the side panel
                // setTimeout(() => {
                //   chrome.runtime.sendMessage("closeSidePanel");
                // }, 1000);
              }
            } catch (err) {

              errormsg("NO data found", err);
            }
          });
        }
      );
    });
  });
}

function scrapeData() {
  // scraping code
  let data1 = [];
  data1 = document.querySelector("div.job-details-content");
  let data2 = data1.querySelector("div.job-details-card");
  let data3 = data2.querySelector("div.air3-card-sections");
  let data4 = [];
  data4 = data3.querySelectorAll("section");
  let jobTitle =
    data4[0]?.querySelector("h4").innerText || "Job Title not found.";
  let postedTime = data4[0]?.querySelector("div.posted-on-line").innerText;
  let jobDescription = Array.from(data4[1]?.querySelectorAll("div, p, span"))
    .map(el => el.innerText)
    .join(" ");
  let projectTimeandAmount = [];
  let cleanedRate;
  data4.forEach((section, index) => {
    let priceSection = section?.querySelector("ul.features");
    let priceList = priceSection?.querySelectorAll("li");
    priceList?.forEach((element) => {
      element?.innerText;
      projectTimeandAmount?.push(element?.innerText);
    });
    // Use the find method to locate the string containing the desired pattern

    let regex = /\$\d+(\.\d+)?\s*(Fixed-price|Hourly)/;
    let hourlyRate = projectTimeandAmount.find((item) => regex.test(item));
    if (hourlyRate) {
      cleanedRate = hourlyRate.replace(/\n/g, " ").trim();
    } else {

    }
  });
  let projectType;
  data4.forEach((section, index) => {
    let projectTypeSection = section?.querySelector("section");
    let projectTypeUl = projectTypeSection?.querySelector("ul.segmentations");
    let projectTypeList = projectTypeUl?.querySelectorAll("li");

    projectTypeList?.forEach((el) => {
      let spanElement = el.querySelector("span"); // Select only the span
      if (spanElement) {
        projectType = spanElement.innerText; // Extract only the span text
      }
    });
  });

  let JobActivity;
  let JobActivityvalue;
  let JobActivitytitle;
  let JobData = [];

  data4.forEach((section, index) => {
    let jobActivitySection = section?.querySelectorAll("section");

    jobActivitySection.forEach((element) => {
      let heading = element?.querySelector("h5")?.innerText;
      if (heading == "Activity on this job") {
        let jobActivityUl = element?.querySelector("ul.client-activity-items");
        let jobActivityList = jobActivityUl?.querySelectorAll("li");
        jobActivityList?.forEach((el) => {
          JobActivitytitle = el?.querySelector("span.title")?.innerText.trim();

          // Look for value inside either <span> or <div>
          JobActivityvalue =
            el?.querySelector("span.value")?.innerText.trim() ||
            el?.querySelector("div.value")?.innerText.trim();

          // Push both title and value to JobData
          JobData.push({ title: JobActivitytitle, value: JobActivityvalue });
        });
      }
    });
  });

  // Now, if you need to access specific data like proposals or any other activity, you can filter it like this:

  let proposals = JobData.find((item) =>
    item.title.toLowerCase().includes("proposals:")
  );
  let lastViewedByClient = JobData.find((item) =>
    item.title.toLowerCase().includes("last viewed by client:")
  );
  let interviewing = JobData.find((item) =>
    item.title.toLowerCase().includes("interviewing:")
  );
  let invitesSent = JobData.find((item) =>
    item.title.toLowerCase().includes("invites sent:")
  );



  let result = JobData.find((item) => item.title.includes("Proposals:"));
  if (result) {
    JobActivity = result?.value; // Output: "Proposals:20 to 50"
  }

  let sidebar = data2?.querySelector("div.sidebar");
  let sidebarSection = sidebar?.querySelector("section");
  let aboutClient = sidebarSection?.querySelector(
    "div.cfe-ui-job-about-client"
  );
  let aboutClientUl = aboutClient.querySelector("ul");
  let aboutClientList = [];
  let clientLocation = "";
  aboutClientList = aboutClientUl.querySelectorAll("li");

  aboutClientList.forEach((el) => {
    const locationElement = el?.querySelector(
      '[data-qa="client-location"] strong'
    );
    const locationContainer = el?.querySelector(
      '[data-qa="client-location"] div'
    );

    let locationText = locationElement?.innerText.trim() || ""; // Extract <strong> text

    // Extract all <span> values inside the div and join them
    if (locationContainer) {
      const firstSpan = locationContainer.querySelector("span");
      if (firstSpan) {
        spanText = firstSpan.innerText.trim(); // Get only the first span (location)
      }
      clientLocation = locationText
        ? `${locationText} ${spanText}`.trim()
        : spanText;
    } else {
      console.warn(
        "Client location element not found. Check the selector or if the element is dynamically loaded."
      );
    }
  });
  let aboutClientDiv = [];
  aboutClientDiv = aboutClient.querySelectorAll("div");
  let reviews = "";
  aboutClientDiv.forEach((element) => {
    let review = element?.querySelector("span");
    if (review != null) {
      let finalReview = review.innerText;
      if (finalReview.includes("Rating ")) {
        let ratingMatch = finalReview.match(/\d+(\.\d+)?/);
        reviews = ratingMatch ? ratingMatch[0] : "";
      }
    } else {
    }
  });
  let attachmentList = [];
  let files = [];
  data4.forEach((section, index) => {
    let AttachmentsSection = section?.querySelector("ul");
    attachmentList = AttachmentsSection?.querySelectorAll("li");
    attachmentList?.forEach((el) => {
      let file = el.querySelector("a")?.href;
      files.push(file);
    });
  });
  let skillArray = [];
  data4.forEach((section, index) => {
    let Skills1 = section.querySelector("h5")?.innerText;
    // Check if the section contains the skills header
    if (Skills1 && Skills1.toLowerCase().includes("skills")) {
      let skillSpans = section.querySelectorAll("span");
      // Extract skills from <a> tags within the section
      skillSpans.forEach((el) => {
        let skillText = el.querySelector("a")?.innerText;
        if (skillText) {
          skillArray.push(skillText.trim());
        }
      });
    }
  });
  let amount = projectTimeandAmount?.[0]?.split("\n,"); // Split by '\n' and take the first part
  let SkillsandExpertise = [...new Set(skillArray)];
  let connects = [];
  connects = sidebarSection?.querySelectorAll("div");
  let receivedConnects;
  connects.forEach((element) => {
    let connected = element?.querySelector("span");
    if (connected != null) {
      let finalconnected = "";
      finalconnected = connected.innerText;
      if (finalconnected.includes("Required Connects")) {
        receivedConnects = connected.nextElementSibling?.textContent.trim();
      } else {
        // reviews = ""
      }
    } else {
    }
  });

  const data = [];
  data.push({
    jobTitle,
    JobActivity,
    cleanedRate,
    jobDescription,
    projectType,
    SkillsandExpertise,
    reviews,
    files,
    clientLocation,
    projectTimeandAmount,
    amount,
    receivedConnects,
  });

  return data;
}

function retrunFunction(id) {
  debugger;
  var returnData = "";
  switch (id) {
    case 1:
      returnData = "Login";
      break;
    case 2:
      returnData = "Logout";
      break;
    case 3:
      returnData = "SaveData";
      break;
    case 4:
      returnData = "microsoftlogin";
      break;
    case 5:
      returnData = "microsoftlogout";
      break;
  }
  return returnData;
}

function errormsg(msg) {
  showToast("errortoaster", msg, "bg-red-500");
}

function sucessmsg(data) {
  showToast("sucesstoaster", data, "bg-green-500");
}

function showToast(toastId, message, bgColorClass) {
  const toast = document.getElementById(toastId);
  if (toast) {
    toast.innerText = message;

    // Apply the dynamic classes: "hidden" (initially) and "flex" (visible)
    toast.classList.remove("hidden");
    toast.classList.add("flex", bgColorClass);

    // Add custom styles for positioning and appearance
    toast.classList.add(
      "fixed",
      "bottom-8",
      "left-1/2",
      "transform",
      "-translate-x-1/2",
      "text-white",
      "text-sm",
      "font-medium",
      "py-2",
      "px-4",
      "rounded",
      "shadow-md"
    );

    // Hide the toast after 1 second
    setTimeout(() => {
      toast.classList.add("hidden");
      toast.classList.remove("flex", bgColorClass); // Remove the bgColorClass dynamically
    }, 1000);
  }
}

/* ==========================================================================
 * Conversation extraction (Upwork Messages room)  —  ADDITIVE
 *
 * Everything below is independent of the job-scraping flow above. It shares no
 * ids, no state and no functions with scrapeData / #save, so the existing
 * Job -> CRM path is unaffected.
 *
 * Flow:
 *   user opens a Messages room -> #extractChat -> executeScript(scrapeConversation)
 *   -> resolve candidate CRM job -> USER CONFIRMS -> POST
 *      /api/upwork/{id}/conversation
 *
 * The job is never attached automatically on a weak signal. A match is only
 * pre-selected when Upwork gave us a hard identifier (a "~0..." job ticket id
 * found in the room); anything softer is offered as a searchable list with
 * nothing pre-selected.
 * ========================================================================== */

/** Console prefix, matching the extension's existing ad-hoc console logging. */
const QCHAT_LOG = "[QuikCRM chat]";

/**
 * Shown when Extract Conversation is clicked (or hovered) somewhere that has no
 * conversation — a job page, or a proposal page. Kept as one constant so the
 * button tooltip, the disabled-click message and the hint-clearing check below
 * can never drift apart.
 */
const CHAT_UNAVAILABLE_MSG = "Open an Upwork Messages conversation first.";

/** True when #chatStatus currently holds the unavailable hint (and so may be
 *  cleared on navigation) rather than a real extraction status. */
function chatStatusIsUnavailableHint() {
  const el = document.getElementById("chatStatus");
  return !!el && (el.textContent || "").trim() === CHAT_UNAVAILABLE_MSG;
}

/** True when a URL is an Upwork Messages room. */
function isUpworkMessagesUrl(url) {
  return typeof url === "string" && /upwork\.com\/(ab\/)?messages\b/i.test(url);
}

function setChatStatus(text, tone) {
  const el = document.getElementById("chatStatus");
  if (!el) return;
  el.textContent = text || "";
  el.style.color =
    tone === "error" ? "#dc2626" : tone === "success" ? "#16a34a" : "";
}

/**
 * Scrape the open Messages room.
 *
 * RUNS IN THE UPWORK TAB, serialized across the process boundary by
 * chrome.scripting.executeScript — so it must stay entirely self-contained: no
 * outer-scope references, no helpers from this file. Same constraint the README
 * documents for scrapeData/retrunFunction.
 *
 * Returns { ok, reason, thread } and never throws across the boundary; a thrown
 * error would surface only as an opaque undefined result.
 */
function scrapeConversation() {
  try {
    const out = {
      threadId: null,
      conversationUrl: window.location.href,
      clientName: null,
      jobTicketId: null,
      jobTitleHint: null,
      messages: [],
      truncated: false,
    };

    // --- thread id: from the URL, the most stable identifier the room exposes.
    // /ab/messages/rooms/room_<hash>  (older layouts: /messages/<id>)
    const roomMatch = window.location.pathname.match(
      /\/(?:rooms|messages)\/([A-Za-z0-9_~-]{4,})/
    );
    if (roomMatch) out.threadId = roomMatch[1];

    // --- job ticket id: the ONLY hard job link Upwork sometimes renders in a
    // room (a contract/job link in the header or a pinned job card). When it is
    // absent we say so rather than guessing — the panel then asks the user.
    const jobAnchor = document.querySelector(
      'a[href*="~0"][href*="/jobs/"], a[href*="~0"][href*="/proposals/"], a[href*="~0"][href*="/contracts/"]'
    );
    if (jobAnchor) {
      const m = jobAnchor.getAttribute("href").match(/~([0-9a-z]{10,})/i);
      if (m) out.jobTicketId = "~" + m[1];
      const t = (jobAnchor.textContent || "").trim();
      if (t) out.jobTitleHint = t;
    }

    // --- room header: client/counterparty name and, on many rooms, the job
    // title as the room subject.
    const header =
      document.querySelector('[data-test="room-header"]') ||
      document.querySelector('[data-testid="room-header"]') ||
      document.querySelector("header");
    if (header) {
      const nameEl =
        header.querySelector('[data-test*="name"], [data-testid*="name"]') ||
        header.querySelector("h1, h2, h3");
      const nm = nameEl && (nameEl.textContent || "").trim();
      if (nm) out.clientName = nm;
      if (!out.jobTitleHint) {
        const subj = header.querySelector(
          '[data-test*="subject"], [data-testid*="subject"], [class*="subject"]'
        );
        const st = subj && (subj.textContent || "").trim();
        if (st) out.jobTitleHint = st;
      }
    }

    // --- messages. Prefer stable data-* hooks; fall back to a structural
    // selector only if Upwork rendered none, and bail rather than scraping
    // arbitrary page text.
    let nodes = document.querySelectorAll(
      '[data-test="message-story"], [data-testid="message-story"], [data-test*="story-item"]'
    );
    if (!nodes.length) {
      const list =
        document.querySelector('[data-test="messages-list"]') ||
        document.querySelector('[data-testid="messages-list"]') ||
        document.querySelector('[class*="message-list"], [class*="story-list"]');
      if (list)
        nodes = list.querySelectorAll('[class*="story"], [class*="message"]');
    }
    if (!nodes.length) {
      return { ok: false, reason: "NO_MESSAGES", thread: out };
    }

    // Who am I? Upwork marks own messages with an alignment/ownership hook.
    // When it does not, senderType stays null rather than being guessed.
    const CAP = 500;
    let order = 0;
    const seen = Object.create(null);

    for (let i = 0; i < nodes.length; i++) {
      if (out.messages.length >= CAP) {
        out.truncated = true;
        break;
      }
      const node = nodes[i];

      const bodyEl =
        node.querySelector(
          '[data-test="message-body"], [data-testid="message-body"], [class*="message-body"]'
        ) || node;
      const text = (bodyEl.innerText || bodyEl.textContent || "").trim();
      if (!text) continue;

      // Sender name.
      const senderEl = node.querySelector(
        '[data-test*="author"], [data-testid*="author"], [class*="author"], [class*="sender"]'
      );
      const senderName = senderEl
        ? (senderEl.textContent || "").trim() || null
        : null;

      // Sender type: only from an explicit ownership marker.
      let senderType = null;
      const cls = (node.className && String(node.className)) || "";
      if (/\b(is-)?own\b|self|outgoing|sent-by-me/i.test(cls)) senderType = "user";
      else if (/incoming|received|other/i.test(cls)) senderType = "client";
      if (!senderType && node.getAttribute("data-test-own") === "true")
        senderType = "user";

      // Timestamp: only an absolute one. Upwork's relative labels ("2 days ago")
      // are NOT parsed into a date — a wrong date is worse than none.
      let sentAt = null;
      const timeEl = node.querySelector("time[datetime], [datetime]");
      const dt = timeEl && timeEl.getAttribute("datetime");
      if (dt) {
        const parsed = new Date(dt);
        if (!isNaN(parsed.getTime())) sentAt = parsed.toISOString();
      }

      // Message id. Upwork's own id when present; otherwise a STABLE synthetic
      // one derived from thread + content (never random, never index-only), so
      // re-extracting the same room upserts instead of duplicating.
      let id =
        node.getAttribute("data-story-id") ||
        node.getAttribute("data-message-id") ||
        node.getAttribute("data-test-story-id") ||
        (node.id && /\d/.test(node.id) ? node.id : null);
      if (!id) {
        let h = 5381;
        const basis =
          (out.threadId || "room") + "|" + (senderName || "") + "|" + text;
        for (let c = 0; c < basis.length; c++) {
          h = ((h << 5) + h + basis.charCodeAt(c)) >>> 0;
        }
        id = "syn_" + h.toString(36) + "_" + text.length;
      }
      if (seen[id]) continue;
      seen[id] = true;

      out.messages.push({
        id,
        text,
        senderName,
        senderType,
        sentAt,
        order: order++,
      });
    }

    if (!out.messages.length)
      return { ok: false, reason: "NO_MESSAGES", thread: out };
    return { ok: true, reason: null, thread: out };
  } catch (err) {
    return {
      ok: false,
      reason: "SCRAPE_ERROR",
      error: String((err && err.message) || err),
    };
  }
}

/** Fetch candidate CRM Upwork jobs (optionally filtered) for the confirm step. */
async function fetchUpworkJobCandidates(query) {
  const store = await new Promise((resolve) =>
    chrome.storage.local.get(["token", "selectedOrganization"], resolve)
  );
  const params = new URLSearchParams({ page: "1", pageSize: "50" });
  if (query) params.set("q", query);
  if (store.selectedOrganization && store.selectedOrganization.id) {
    params.set("orgId", store.selectedOrganization.id);
  }
  const res = await fetch(`${QCRM_API_BASE_URL}/api/upwork?${params.toString()}`, {
    headers: { Authorization: "Bearer " + store.token },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) {
    throw new Error(
      (body && body.error) ||
        (res.status === 401
          ? "Session expired. Please sign in again."
          : "Could not load jobs.")
    );
  }
  const data = body.data || {};
  return data.items || [];
}

/**
 * Render the confirm step.
 *
 * `preselectId` is set ONLY on a hard identifier match (job ticket id). With a
 * soft signal the list is shown with a blank first option, so the user must make
 * a deliberate choice — no conversation is ever attached by default.
 */
function renderChatJobChoices(jobs, preselectId) {
  const select = document.getElementById("chatJobSelect");
  if (!select) return;
  select.innerHTML = "";

  if (!preselectId) {
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— Select the matching job —";
    select.appendChild(blank);
  }
  jobs.forEach((job) => {
    const opt = document.createElement("option");
    opt.value = job.id;
    // textContent, not innerHTML: job titles are scraped third-party text.
    opt.textContent = job.jobTitle || "(untitled job)";
    if (preselectId && job.id === preselectId) opt.selected = true;
    select.appendChild(opt);
  });

  document.getElementById("chatConfirm").style.display = "block";
}

/** Wire the conversation UI. Called on panel load, alongside the job handlers. */
function handleExtractChatClick() {
  const button = document.getElementById("extractChat");
  const section = document.getElementById("chatsection");
  if (!button || !section) return;

  // The section is ALWAYS VISIBLE. Only the button's availability tracks the
  // current URL — visibility and availability are deliberately separate
  // concerns, so the panel's action list never changes shape as the user moves
  // around Upwork.
  //
  // Re-evaluated on navigation, not just once at bootstrap: the side panel stays
  // open while the user moves around Upwork, so a single check would leave the
  // button stuck in whatever state the panel happened to open in.
  const syncChatAvailability = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs && tabs[0] && tabs[0].url;
      const available = isUpworkMessagesUrl(url);
      button.disabled = !available;
      // Keep the reason visible on the button itself, not only after a click.
      button.title = available
        ? "Extract this Upwork conversation"
        : CHAT_UNAVAILABLE_MSG;
      // Clear a stale unavailable-message once the user reaches a real room, but
      // never clobber a live status (extracting / results / an error).
      if (available && chatStatusIsUnavailableHint()) setChatStatus("");
    });
  };
  syncChatAvailability();

  // Both events matter: onUpdated catches in-page navigation within one tab
  // (Upwork is a SPA, so opening a room often fires only a URL change), and
  // onActivated catches the user switching to a different tab entirely.
  if (chrome.tabs.onUpdated && chrome.tabs.onUpdated.addListener) {
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.status === "complete") syncChatAvailability();
    });
  }
  if (chrome.tabs.onActivated && chrome.tabs.onActivated.addListener) {
    chrome.tabs.onActivated.addListener(syncChatAvailability);
  }

  // Scraped thread awaiting confirmation. Cleared on save/cancel so a stale
  // thread can never be saved against a later, unrelated confirmation.
  let pendingThread = null;

  const resetConfirm = () => {
    pendingThread = null;
    const c = document.getElementById("chatConfirm");
    if (c) c.style.display = "none";
  };

  document.getElementById("chatCancel").addEventListener("click", () => {
    resetConfirm();
    setChatStatus("Cancelled.");
    console.log(QCHAT_LOG, "extraction cancelled by user");
  });

  // Search re-queries the CRM; nothing is auto-selected from a search result.
  let searchTimer = null;
  document.getElementById("chatJobSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      try {
        const jobs = await fetchUpworkJobCandidates(q);
        renderChatJobChoices(jobs, null);
        if (!jobs.length) setChatStatus("No matching jobs in CRM.", "error");
        else setChatStatus(`${jobs.length} job(s) — pick the right one.`);
      } catch (err) {
        setChatStatus(err.message || "Could not search jobs.", "error");
      }
    }, 300);
  });

  button.addEventListener("click", () => {
    resetConfirm();
    setChatStatus("Extracting…");
    console.log(QCHAT_LOG, "extraction started");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return setChatStatus("No active tab.", "error");

      // Belt-and-braces: the button is disabled off a Messages room, but the
      // active tab can change between the last sync and this click.
      if (!isUpworkMessagesUrl(tab.url)) {
        setChatStatus(CHAT_UNAVAILABLE_MSG, "error");
        return;
      }

      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, function: scrapeConversation },
        async (results) => {
          if (chrome.runtime.lastError) {
            console.error(
              QCHAT_LOG,
              "injection failed",
              chrome.runtime.lastError.message
            );
            return setChatStatus(
              "Extraction failed — reload the Upwork tab.",
              "error"
            );
          }
          const res = results && results[0] && results[0].result;
          if (!res) {
            console.error(QCHAT_LOG, "no result from injected scraper");
            return setChatStatus("Extraction failed.", "error");
          }
          if (!res.ok) {
            if (res.reason === "NO_MESSAGES") {
              console.log(QCHAT_LOG, "no conversation found");
              return setChatStatus(
                "No conversation found on this page.",
                "error"
              );
            }
            console.error(QCHAT_LOG, "scrape error", res.error);
            return setChatStatus("Extraction failed.", "error");
          }

          const thread = res.thread;
          pendingThread = thread;
          console.log(QCHAT_LOG, "conversation detected", {
            threadId: thread.threadId,
            jobTicketId: thread.jobTicketId,
            messages: thread.messages.length,
            truncated: thread.truncated,
          });
          setChatStatus(
            `${thread.messages.length} message(s) extracted` +
              (thread.truncated ? " (capped at 500)" : "") +
              " — confirm the job."
          );

          // Resolve a candidate. A hard job-ticket-id match is the ONLY basis
          // for pre-selecting; the title hint merely seeds the search box.
          try {
            let jobs = await fetchUpworkJobCandidates(
              thread.jobTicketId ? "" : thread.jobTitleHint || ""
            );
            let preselect = null;
            if (thread.jobTicketId) {
              const hit = jobs.find(
                (j) => j.upworkJobId === thread.jobTicketId
              );
              if (hit) {
                preselect = hit.id;
                console.log(
                  QCHAT_LOG,
                  "job matched by ticket id",
                  thread.jobTicketId
                );
              } else {
                jobs = await fetchUpworkJobCandidates(thread.jobTitleHint || "");
              }
            }
            if (!preselect) {
              console.log(QCHAT_LOG, "no hard job match — user must select");
            }
            if (!jobs.length) {
              setChatStatus(
                "No Upwork jobs in CRM to link to. Save the job first.",
                "error"
              );
              return;
            }
            const search = document.getElementById("chatJobSearch");
            if (search && !preselect && thread.jobTitleHint) {
              search.value = thread.jobTitleHint;
            }
            renderChatJobChoices(jobs, preselect);
          } catch (err) {
            console.error(QCHAT_LOG, "candidate lookup failed", err);
            setChatStatus(err.message || "Could not load jobs.", "error");
          }
        }
      );
    });
  });

  // Save — only reachable after the user picked a job.
  document
    .getElementById("chatConfirmSave")
    .addEventListener("click", async () => {
      if (!pendingThread)
        return setChatStatus("Extract a conversation first.", "error");
      const jobId = document.getElementById("chatJobSelect").value;
      if (!jobId) return setChatStatus("Select the matching job first.", "error");

      setChatStatus("Saving…");
      console.log(QCHAT_LOG, "CRM save started", {
        jobId,
        messages: pendingThread.messages.length,
      });
      try {
        const store = await new Promise((resolve) =>
          chrome.storage.local.get(["token"], resolve)
        );
        const res = await fetch(
          `${QCRM_API_BASE_URL}/api/upwork/${jobId}/conversation`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + store.token,
            },
            body: JSON.stringify({
              threadId: pendingThread.threadId,
              conversationUrl: pendingThread.conversationUrl,
              clientName: pendingThread.clientName,
              messages: pendingThread.messages,
            }),
          }
        );
        const body = await res.json().catch(() => null);
        if (!res.ok || !body || body.success === false) {
          const message =
            (body && body.error) ||
            (res.status === 401
              ? "Session expired. Please sign in again."
              : "Could not save the conversation.");
          console.error(QCHAT_LOG, "CRM save failed", message);
          setChatStatus(message, "error");
          errormsg(message);
          return;
        }
        const data = body.data || {};
        console.log(QCHAT_LOG, "CRM save completed", data);
        // Re-saving an already-saved thread is a successful no-op server-side
        // (upsert), so this reads as success rather than a duplicate error.
        const note = data.failed ? ` (${data.failed} failed)` : "";
        setChatStatus(`Saved ${data.saved} message(s)${note}.`, "success");
        sucessmsg(`Conversation saved to CRM (${data.saved} message(s)).`);
        resetConfirm();
      } catch (err) {
        console.error(QCHAT_LOG, "CRM save error", err);
        setChatStatus(err.message || "Could not save the conversation.", "error");
      }
    });
}


/* ==========================================================================
 * Proposal extraction (Upwork submitted proposal)  —  ADDITIVE
 *
 * Captures the Connects the freelancer ACTUALLY spent on their own submitted
 * proposal, which only /nx/proposals/{proposalId} exposes. Independent of both
 * the job-scraping and conversation flows; shares no ids or state with either.
 *
 * NEVER substitutes another Connects value. The job listing's "Required
 * Connects", the account's available Connects balance, and the listing's
 * proposal-count range are all DIFFERENT quantities; when the proposal page does
 * not state actual spend, this reports null and the panel says so.
 * ========================================================================== */

const QPROP_LOG = "[QuikCRM proposal]";

/**
 * Shown when Extract Proposal is unavailable. Covers BOTH "not a proposal page"
 * and the proposal LIST page (/nx/proposals/ with no id): the list has no single
 * proposal to read, so extraction must not run there either.
 */
const PROPOSAL_UNAVAILABLE_MSG = "Open a submitted proposal first.";

function proposalStatusIsUnavailableHint() {
  const el = document.getElementById("proposalStatus");
  return !!el && (el.textContent || "").trim() === PROPOSAL_UNAVAILABLE_MSG;
}

/**
 * Total Connects attributed to one proposal for Sales Cost:
 *   total = submission Connects + boost Connects
 *
 * Returns null when the submission amount is unknown — a boost figure alone is
 * not a total, and returning 0 there would read as a real, free proposal. A
 * missing/null boost counts as 0, which is the documented data contract
 * ("no boost" and "boost not exposed" are both "nothing extra was charged").
 */
function upworkTotalConnects(connectsUsed, boostConnects) {
  if (connectsUsed === null || connectsUsed === undefined) return null;
  const boost =
    boostConnects === null || boostConnects === undefined ? 0 : boostConnects;
  return connectsUsed + boost;
}

/**
 * True only for an INDIVIDUAL submitted proposal, never the proposal list.
 *
 * `/nx/proposals/` (and `/nx/proposals/submitted`, `/nx/proposals/archived`, …)
 * are index pages with no single proposal to read, so extraction must not run
 * there — a trailing-slash-only match would wrongly enable the button on the
 * list. An id segment is therefore required, and the known list sub-routes are
 * excluded by name.
 */
const PROPOSAL_LIST_SEGMENTS = /^(submitted|archived|active|drafts|offers|declined)$/i;

function isUpworkProposalUrl(url) {
  if (typeof url !== "string") return false;
  const m = url.match(/upwork\.com\/nx\/proposals\/(?:[a-z-]+\/)?([~A-Za-z0-9_-]+)/i);
  if (!m) return false;
  const id = m[1];
  if (!id || id.length < 4) return false;
  return !PROPOSAL_LIST_SEGMENTS.test(id);
}

function setProposalStatus(text, tone) {
  const el = document.getElementById("proposalStatus");
  if (!el) return;
  el.textContent = text || "";
  el.style.color =
    tone === "error" ? "#dc2626" : tone === "success" ? "#16a34a" : "";
}

/**
 * Scrape the open submitted-proposal page.
 *
 * RUNS IN THE UPWORK TAB — serialized across the process boundary, so it must
 * stay entirely self-contained (no outer-scope references), exactly like
 * scrapeData and scrapeConversation.
 *
 * Returns { ok, reason, proposal } and never throws across the boundary.
 */
function scrapeProposal() {
  try {
    const out = {
      proposalId: null,
      proposalUrl: window.location.href,
      proposalSubmittedAt: null,
      connectsUsed: null,
      boostConnects: null,
      jobTicketId: null,
      jobTitleHint: null,
      coverLetter: null,
    };

    // --- proposal id: straight from the URL. The stable identifier.
    const idMatch = window.location.pathname.match(
      /\/nx\/proposals\/(?:[a-z-]+\/)?([~A-Za-z0-9_-]{4,})/i
    );
    if (idMatch) out.proposalId = idMatch[1];

    // --- job ticket id + title: a proposal page normally links to its job.
    const jobAnchor = document.querySelector(
      'a[href*="~0"][href*="/jobs/"], a[href*="~0"][href*="/applicants/"]'
    );
    if (jobAnchor) {
      const m = jobAnchor.getAttribute("href").match(/~([0-9a-z]{10,})/i);
      if (m) out.jobTicketId = "~" + m[1];
      const t = (jobAnchor.textContent || "").trim();
      if (t) out.jobTitleHint = t;
    }
    if (!out.jobTitleHint) {
      const h = document.querySelector("h1, h2");
      const ht = h && (h.textContent || "").trim();
      if (ht) out.jobTitleHint = ht;
    }

    // --- submitted date: only from an absolute datetime attribute. Upwork's
    // relative labels ("2 days ago") are NOT parsed — a wrong date is worse
    // than none.
    const timeEl = document.querySelector("time[datetime], [datetime]");
    const dt = timeEl && timeEl.getAttribute("datetime");
    if (dt) {
      const parsed = new Date(dt);
      if (!isNaN(parsed.getTime())) out.proposalSubmittedAt = parsed.toISOString();
    }

    // --- Connects.
    //
    // Read from the LABELLED line only. We locate a label that states actual
    // spend for THIS proposal, then take the number from that same line. A bare
    // number found anywhere on the page is ignored, because the page also shows
    // the account's available balance and the listing's required amount — both
    // of which would be plausible-looking wrong answers.
    //
    // Matching is done on normalised text so a markup change (number in its own
    // <span>, extra whitespace) does not break it.
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

    // Candidate lines: small-ish elements that contain the word "connect".
    const candidates = [];
    const all = document.querySelectorAll("li, p, div, span, td, dd, dt");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const text = norm(el.textContent);
      if (!text || text.length > 200) continue;
      if (!/connect/i.test(text)) continue;
      // Prefer leaf-ish nodes so we do not read a whole container's text.
      if (el.querySelector("li, p, div, table")) continue;
      candidates.push(text);
    }

    // WHAT COUNTS AS THIS PROPOSAL'S CONNECTS COST.
    //
    // Upwork does not expose a historical "actual spend" figure on these pages.
    // What it DOES label is the submission price, live text:
    //     "Required Connects to submit a proposal: 19"
    // By product decision that submission amount is our Sales Cost proxy, so
    // `connectsUsed` here means "Connects required/charged to submit this
    // proposal" - NOT a verified historical deduction. Written down because the
    // field name alone does not convey it.
    //
    // Still EXCLUDED, because it is a different quantity that must never land
    // in connectsUsed:
    //     "Available Connects: 107" / "Connects balance" / "remaining"
    // That is the ACCOUNT wallet, unrelated to any single proposal.
    //
    // This does NOT touch CrmUpworkJob.requiredConnects: that column is written
    // only by the job scraper from the job LISTING and is left exactly as-is.
    //
    // `[\d,]+` not `\d+`: Upwork thousands-separates large figures.
    const SUBMISSION =
      /\b(required\s+connects?|connects?\s+required|connects?\s+(used|spent|charged)|(used|spent|charged)\s+[\d,]+\s+connects?|cost\s+to\s+submit)\b/i;
    const BOOST = /\bboost/i;
    // "available/balance/remaining/left/you have" are the words Upwork uses for
    // the wallet. Keeping them is what stops "Available Connects: 107" being
    // read as a 107-Connect proposal cost.
    const EXCLUDE = /\b(available|balance|remaining|left|you\s+have)\b/i;

    /**
     * The Connects figure on an already-label-matched line.
     *
     * Upwork puts the number on EITHER side of the word, and the gap can be
     * long: "Required Connects to submit a proposal: 19" has 20+ characters
     * between "Connects" and "19", so a tight bounded gap silently returned
     * null on the real live string. Strategy, in order:
     *   1. "<n> Connects"            e.g. "Boost: 10 Connects"
     *   2. trailing "...: <n>"       e.g. "Required Connects to submit a proposal: 19"
     *   3. the only number on the line
     * Bounded to digits/commas so a price ("$2,500") on the same line cannot be
     * mistaken for a Connects count - by then the line has already had to match
     * a Connects label, so any number here belongs to that label.
     */
    const numberIn = (text) => {
      const toInt = (raw) => {
        if (!raw) return null;
        const n = parseInt(String(raw).replace(/,/g, ""), 10);
        return Number.isFinite(n) ? n : null;
      };
      // 1. number immediately before the word
      let m = text.match(/(\d[\d,]*)\s*connects?\b/i);
      if (m) return toInt(m[1]);
      // 2. number after a colon / dash anywhere later on the line
      m = text.match(/connects?\b[^\d]*?[:\-\u2013]\s*(\d[\d,]*)/i);
      if (m) return toInt(m[1]);
      // 3. the line's only number
      const all = text.match(/\d[\d,]*/g);
      if (all && all.length === 1) return toInt(all[0]);
      return null;
    };

    for (let i = 0; i < candidates.length; i++) {
      const text = candidates[i];
      if (EXCLUDE.test(text)) continue;

      if (BOOST.test(text)) {
        if (out.boostConnects === null) {
          const n = numberIn(text);
          if (n !== null) out.boostConnects = n;
        }
        continue;
      }
      if (SUBMISSION.test(text) && out.connectsUsed === null) {
        const n = numberIn(text);
        if (n !== null) out.connectsUsed = n;
      }
    }

    // --- cover letter.
    //
    // innerText, NOT textContent: textContent concatenates every node with no
    // separators, collapsing paragraphs and bullet lines into one unreadable
    // run. innerText renders as displayed, so blank lines between paragraphs and
    // one-bullet-per-line survive - which is the whole point of storing it.
    //
    // Located by its LABEL rather than a CSS class, matching how the Connects
    // values are found: walk headings/labels that read "Cover letter" and take
    // the nearest following content block. Falls back to a labelled container's
    // own text when Upwork renders the label and body in one element.
    /**
     * Block text with line structure intact.
     *
     * innerText is preferred: the browser renders it as displayed, so paragraph
     * breaks and one-bullet-per-line survive. But textContent is NOT a safe
     * fallback on its own - it concatenates every node with no separator, so
     * "<p>A</p><p>B</p>" collapses to "AB" and the letter's structure (the
     * reason we store it) is destroyed.
     *
     * So when innerText is unavailable we reconstruct the breaks by walking
     * block-level elements and <br>, rather than accepting the collapsed text.
     */
    const blockText = (node) => {
      if (!node) return "";
      if (typeof node.innerText === "string" && node.innerText.trim()) {
        return node.innerText;
      }
      const BLOCK = /^(P|DIV|LI|UL|OL|SECTION|ARTICLE|H[1-6]|BR|TR|BLOCKQUOTE)$/;
      let out = "";
      const walk = (n) => {
        for (let i = 0; i < n.childNodes.length; i++) {
          const c = n.childNodes[i];
          if (c.nodeType === 3) {
            out += c.nodeValue;
          } else if (c.nodeType === 1) {
            const isBlock = BLOCK.test(c.tagName);
            if (c.tagName === "BR") {
              out += "\n";
              continue;
            }
            if (isBlock && out && !out.endsWith("\n")) out += "\n";
            walk(c);
            if (isBlock && out && !out.endsWith("\n")) out += "\n";
          }
        }
      };
      walk(node);
      return out;
    };

    const readCover = () => {
      const LABEL = /^\s*cover\s*letter\s*:?\s*$/i;
      const heads = document.querySelectorAll(
        "h1, h2, h3, h4, h5, h6, strong, b, label, dt, span, div"
      );
      for (let i = 0; i < heads.length; i++) {
        const el = heads[i];
        const t = (el.textContent || "").trim();
        if (!LABEL.test(t)) continue;
        const candidates = [
          el.nextElementSibling,
          el.parentElement && el.parentElement.nextElementSibling,
        ];
        for (let c = 0; c < candidates.length; c++) {
          const node = candidates[c];
          if (!node) continue;
          const body = blockText(node).trim();
          if (body && !LABEL.test(body)) return body;
        }
      }
      // Fallback: a container whose own text STARTS with the label - strip the
      // label and keep the remainder. Uses the same structure-preserving read.
      const all = document.querySelectorAll("section, article, div, li");
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        const t = blockText(el).trim();
        if (!/^cover\s*letter\s*:?\s*(\n|$)/i.test(t)) continue;
        if (el.querySelector("section, article")) continue;
        const body = t.replace(/^cover\s*letter\s*:?\s*\n?/i, "").trim();
        if (body) return body;
      }
      return null;
    };
    out.coverLetter = readCover();

    if (!out.proposalId) {
      return { ok: false, reason: "NO_PROPOSAL", proposal: out };
    }
    // A proposal with no stated spend is a valid, reportable outcome — the
    // panel tells the user rather than inventing a number.
    return { ok: true, reason: null, proposal: out };
  } catch (err) {
    return {
      ok: false,
      reason: "SCRAPE_ERROR",
      error: String((err && err.message) || err),
    };
  }
}

/**
 * Render the proposal confirm step.
 *
 * A job is pre-selected ONLY on a hard ticket-id match; otherwise the list opens
 * on a blank option so the user must choose deliberately and a proposal is never
 * attached to an arbitrary job.
 *
 * Each option shows the title AND Upwork's job ticket id, because two captures
 * can share a title (a client reposting the same brief) and the id is the only
 * thing that tells them apart.
 */
function renderProposalJobChoices(jobs, preselectId) {
  const select = document.getElementById("proposalJobSelect");
  if (!select) return;
  select.innerHTML = "";
  if (!preselectId) {
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "— Select the matching job —";
    select.appendChild(blank);
  }
  jobs.forEach((job) => {
    const opt = document.createElement("option");
    opt.value = job.id;
    // textContent, not innerHTML: titles are scraped third-party text.
    const title = job.jobTitle || "(untitled job)";
    opt.textContent = job.upworkJobId
      ? `${title} — ${job.upworkJobId}`
      : title;
    if (preselectId && job.id === preselectId) opt.selected = true;
    select.appendChild(opt);
  });
  document.getElementById("proposalConfirm").style.display = "block";
}

/** Title of the job currently chosen in the picker, for confirmation messages. */
function selectedProposalJobTitle() {
  const select = document.getElementById("proposalJobSelect");
  if (!select || !select.value) return null;
  const label = select.options[select.selectedIndex].textContent || "";
  // Strip the " — ~02…" suffix added above; the user thinks in titles.
  return label.split(" — ")[0] || label;
}

/** Wire the proposal UI. */
function handleExtractProposalClick() {
  const button = document.getElementById("extractProposal");
  const section = document.getElementById("proposalsection");
  if (!button || !section) return;

  // Always visible; only availability reacts to the URL — same split as the
  // conversation block above.
  const syncProposalAvailability = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs && tabs[0] && tabs[0].url;
      const available = isUpworkProposalUrl(url);
      button.disabled = !available;
      button.title = available
        ? "Extract this submitted proposal"
        : PROPOSAL_UNAVAILABLE_MSG;
      if (available && proposalStatusIsUnavailableHint()) setProposalStatus("");
    });
  };
  syncProposalAvailability();
  if (chrome.tabs.onUpdated && chrome.tabs.onUpdated.addListener) {
    chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.status === "complete") syncProposalAvailability();
    });
  }
  if (chrome.tabs.onActivated && chrome.tabs.onActivated.addListener) {
    chrome.tabs.onActivated.addListener(syncProposalAvailability);
  }

  let pendingProposal = null;
  const resetConfirm = () => {
    pendingProposal = null;
    const c = document.getElementById("proposalConfirm");
    if (c) c.style.display = "none";
  };

  document.getElementById("proposalCancel").addEventListener("click", () => {
    resetConfirm();
    setProposalStatus("Cancelled.");
    console.log(QPROP_LOG, "extraction cancelled by user");
  });

  // Live CRM search. Matches job title, description, skills, location AND the
  // Upwork job ticket id (see buildUpworkWhere), so pasting "~0220846…" finds
  // its job directly. An empty box restores the full list rather than clearing
  // it — the user must always be able to get back to every job.
  let searchTimer = null;
  document.getElementById("proposalJobSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      try {
        // Keep whatever the user already picked selected if it survives the
        // filter, so typing does not silently discard a correct choice.
        const select = document.getElementById("proposalJobSelect");
        const current = select ? select.value : "";
        const jobs = await fetchUpworkJobCandidates(q);
        const keep = jobs.some((j) => j.id === current) ? current : null;
        renderProposalJobChoices(jobs, keep);
        if (!jobs.length) {
          setProposalStatus(
            q
              ? "No CRM jobs match that search — clear the box to see all jobs."
              : "No Upwork jobs are available in CRM. Add the job to CRM first.",
            "error"
          );
        } else {
          setProposalStatus(`${jobs.length} job(s) — pick the right one.`);
        }
      } catch (err) {
        setProposalStatus(err.message || "Could not search jobs.", "error");
      }
    }, 300);
  });

  // Echo the chosen job back so the user can verify the link before saving.
  const proposalSelectEl = document.getElementById("proposalJobSelect");
  if (proposalSelectEl) {
    proposalSelectEl.addEventListener("change", () => {
      const title = selectedProposalJobTitle();
      if (!title || !pendingProposal) return;
      const p = pendingProposal;
      const bits = [`Proposal ID: ${p.proposalId}`];
      if (p.connectsUsed !== null) {
        bits.push(`Connects Used: ${p.connectsUsed}`);
        bits.push(`Boost Connects: ${p.boostConnects === null ? 0 : p.boostConnects}`);
      } else {
        bits.push("Connects: not found");
      }
      bits.push(
        p.coverLetter
          ? `Cover Letter: ${p.coverLetter.length} characters`
          : "Cover Letter: not found"
      );
      bits.push(`Selected Job: ${title}`);
      setProposalStatus(bits.join(" · "));
    });
  }

  button.addEventListener("click", () => {
    resetConfirm();
    setProposalStatus("Extracting…");
    console.log(QPROP_LOG, "extraction started");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab) return setProposalStatus("No active tab.", "error");
      if (!isUpworkProposalUrl(tab.url)) {
        setProposalStatus(PROPOSAL_UNAVAILABLE_MSG, "error");
        return;
      }

      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, function: scrapeProposal },
        async (results) => {
          if (chrome.runtime.lastError) {
            console.error(
              QPROP_LOG,
              "injection failed",
              chrome.runtime.lastError.message
            );
            return setProposalStatus(
              "Extraction failed — reload the Upwork tab.",
              "error"
            );
          }
          const res = results && results[0] && results[0].result;
          if (!res) {
            console.error(QPROP_LOG, "no result from injected scraper");
            return setProposalStatus("Extraction failed.", "error");
          }
          if (!res.ok) {
            if (res.reason === "NO_PROPOSAL") {
              console.log(QPROP_LOG, "no proposal found on this page");
              return setProposalStatus("No proposal found on this page.", "error");
            }
            console.error(QPROP_LOG, "scrape error", res.error);
            return setProposalStatus("Extraction failed.", "error");
          }

          const proposal = res.proposal;
          pendingProposal = proposal;
          console.log(QPROP_LOG, "proposal detected", {
            proposalId: proposal.proposalId,
            jobTicketId: proposal.jobTicketId,
            connectsUsed: proposal.connectsUsed,
            boostConnects: proposal.boostConnects,
            // Length only — the letter itself is client correspondence and
            // does not belong in the console.
            coverLetterChars: proposal.coverLetter ? proposal.coverLetter.length : 0,
          });

          // Show base / boost / total so the user can VERIFY the Connects
          // figures before saving, and report honestly when Upwork stated none
          // rather than showing a fabricated number. The save is still allowed
          // with no Connects (proposal id + date are useful on their own).
          // Character count only — never the letter itself. The side panel is
          // narrow and the text is long; the count is enough to confirm the
          // right letter was picked up before saving.
          const coverNote = proposal.coverLetter
            ? ` · Cover letter: ${proposal.coverLetter.length} characters`
            : " · Cover letter: not found";

          if (proposal.connectsUsed === null) {
            // Display-only: the "Connects not found on this page" prefix is
            // deliberately omitted here. Nothing about the extraction changes —
            // connectsUsed stays null and is still sent to the API as null.
            // `.replace` strips coverNote's leading " · " separator, which only
            // makes sense when something precedes it.
            setProposalStatus(
              coverNote.replace(/^ · /, "") +
                " — confirm the job to save the proposal.",
              
            );
          } else {
            const boost = proposal.boostConnects === null ? 0 : proposal.boostConnects;
            setProposalStatus(
              `Base Connects: ${proposal.connectsUsed} · Boost Connects: ${boost} · ` +
                `Total Connects Used: ${upworkTotalConnects(proposal.connectsUsed, proposal.boostConnects)}` +
                coverNote +
                " — confirm the job."
            );
          }

          try {
            // Job resolution, in order of confidence. The guiding rule: a
            // failed AUTO-MATCH must never look like "there are no jobs".
            // Those are different states, and conflating them is what made an
            // already-captured job unlinkable a day later.
            //
            //   1. hard match on Upwork's job ticket id  -> pre-select it
            //   2. otherwise -> show the FULL CRM job list for manual choice
            //
            // The list is always fetched live from /api/upwork, so a job added
            // days before this proposal was opened is present and selectable.
            const allJobs = await fetchUpworkJobCandidates("");
            let jobs = allJobs;
            let preselect = null;

            if (proposal.jobTicketId) {
              const hit = allJobs.find(
                (j) => j.upworkJobId === proposal.jobTicketId
              );
              if (hit) {
                preselect = hit.id;
                console.log(
                  QPROP_LOG,
                  "job matched by ticket id",
                  proposal.jobTicketId
                );
              }
            }

            if (!preselect) {
              console.log(
                QPROP_LOG,
                "no hard job match — showing " + allJobs.length + " CRM job(s) to select"
              );
            }

            // ONLY a genuinely empty CRM is a dead end. Previously this fired
            // whenever a title-filtered query returned nothing, which is why an
            // existing job reported "Save the job first".
            if (!allJobs.length) {
              setProposalStatus(
                "No Upwork jobs are available in CRM. Add the job to CRM first.",
                "error"
              );
              return;
            }

            // Seed the search box with the page's job title as a CONVENIENCE
            // only - the full list is already rendered, so a title that matches
            // nothing narrows the view without ever hiding the jobs themselves.
            const search = document.getElementById("proposalJobSearch");
            if (search && !preselect && proposal.jobTitleHint) {
              search.value = proposal.jobTitleHint;
              const narrowed = await fetchUpworkJobCandidates(
                proposal.jobTitleHint
              );
              if (narrowed.length) {
                jobs = narrowed;
              } else {
                // Nothing matched the hint: clear it so the box does not look
                // like a filter that is hiding results.
                search.value = "";
              }
            }
            renderProposalJobChoices(jobs, preselect);
          } catch (err) {
            console.error(QPROP_LOG, "candidate lookup failed", err);
            setProposalStatus(err.message || "Could not load jobs.", "error");
          }
        }
      );
    });
  });

  document
    .getElementById("proposalConfirmSave")
    .addEventListener("click", async () => {
      if (!pendingProposal)
        return setProposalStatus("Extract a proposal first.", "error");
      const jobId = document.getElementById("proposalJobSelect").value;
      if (!jobId)
        return setProposalStatus("Select the matching job first.", "error");

      // Read the title BEFORE the await: resetConfirm() clears the picker on
      // success, so reading it afterwards would yield nothing to name.
      const jobTitleAtSave = selectedProposalJobTitle();
      setProposalStatus("Saving…");
      console.log(QPROP_LOG, "CRM save started", {
        jobId,
        jobTitle: jobTitleAtSave,
        proposalId: pendingProposal.proposalId,
        coverLetterChars: pendingProposal.coverLetter
          ? pendingProposal.coverLetter.length
          : 0,
      });
      try {
        const store = await new Promise((resolve) =>
          chrome.storage.local.get(["token"], resolve)
        );
        const res = await fetch(
          `${QCRM_API_BASE_URL}/api/upwork/${jobId}/proposal`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + store.token,
            },
            body: JSON.stringify({
              proposalId: pendingProposal.proposalId,
              proposalSubmittedAt: pendingProposal.proposalSubmittedAt,
              connectsUsed: pendingProposal.connectsUsed,
              boostConnects: pendingProposal.boostConnects,
              proposalCoverLetter: pendingProposal.coverLetter,
            }),
          }
        );
        const body = await res.json().catch(() => null);
        if (!res.ok || !body || body.success === false) {
          const message =
            (body && body.error) ||
            (res.status === 401
              ? "Session expired. Please sign in again."
              : "Could not save the proposal.");
          console.error(QPROP_LOG, "CRM save failed", message);
          setProposalStatus(message, "error");
          errormsg(message);
          return;
        }
        const data = body.data || {};
        console.log(QPROP_LOG, "CRM save completed", data);
        // Re-extracting the same proposal updates the same columns, so this is
        // a success, not a duplicate error.
        const savedTo = data.jobTitle || jobTitleAtSave || "the selected job";
        const connectsNote =
          data.connectsUsed === null || data.connectsUsed === undefined
            ? "Connects: not found"
            : `Connects: saved (${upworkTotalConnects(
                data.connectsUsed,
                data.boostConnects
              )} total)`;
        const coverNoteSaved = data.coverLetterLength
          ? "Cover letter: saved"
          : "Cover letter: not found";
        setProposalStatus(
          `Proposal saved to: ${savedTo} · ${coverNoteSaved} · ${connectsNote}`,
          "success"
        );
        sucessmsg(`Proposal saved to ${savedTo}.`);
        resetConfirm();
      } catch (err) {
        console.error(QPROP_LOG, "CRM save error", err);
        setProposalStatus(err.message || "Could not save the proposal.", "error");
      }
    });
}

/**
 * Bootstrap the conversation UI once its markup exists.
 *
 * WHY THIS IS NOT A PLAIN getElementById CHECK: popup.js loads the panel body
 * with `loadHTML(html)` — a fetch().then() — and then calls
 * detectAndLoadScript() on the very next line, synchronously. So this script is
 * appended to the document BEFORE the awaited HTML is injected, and at the
 * moment it first runs #extractChat does not exist yet. A one-shot check here
 * silently no-ops and the Extract Conversation button never appears, even though
 * the markup shows up in the DOM a tick later.
 *
 * The job-scraping handlers above have the same race but tolerate it for an
 * unrelated reason, so this is fixed HERE rather than in popup.js's shared
 * loader — changing that loader's ordering would alter the boot sequence the
 * existing job flow depends on.
 *
 * MutationObserver rather than a fixed timeout: it fires as soon as the node
 * lands, and it also covers a panel re-render (changeScript re-appends this
 * script when the user switches tabs). Disconnects on the first hit, and gives
 * up after a bounded wait so a genuinely absent block does not leave an observer
 * running forever.
 */
function bootstrapChatUi() {
  // Both additive UIs are bootstrapped together: they land in the same injected
  // markup, so one observer serves both rather than two racing observers.
  const wire = () => {
    handleExtractChatClick();
    handleExtractProposalClick();
  };
  if (document.getElementById("extractChat")) {
    wire();
    return;
  }
  if (!document.body) {
    document.addEventListener("DOMContentLoaded", bootstrapChatUi, { once: true });
    return;
  }
  let done = false;
  const observer = new MutationObserver(() => {
    if (done || !document.getElementById("extractChat")) return;
    done = true;
    observer.disconnect();
    wire();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // Safety valve: stop observing if the markup never arrives (e.g. an older
  // upwork.html without the chat block).
  setTimeout(() => {
    if (!done) {
      done = true;
      observer.disconnect();
    }
  }, 10000);
}

bootstrapChatUi();
