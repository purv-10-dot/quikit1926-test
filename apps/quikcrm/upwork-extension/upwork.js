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

// Check if the element with the class 'job-details-loader' exists
const jobDetailsLoader = document.querySelectorAll(".job-details-content");


// If the element is found, trigger the click event programmatically on the fetchData button
if (jobDetailsLoader) {

  if (fetchData) {
    fetchData.click(); // Trigger click event on fetchData button
    fetchGroups();
    enableGroupSearch();
    handleSaveClick();
    getSearchPageData();
    getgroupSearchPageData();
    getFreelancerPageIds();
  } else {
    console.log("fetchData element not found at the time of click.");
  }
} else {
  console.log("job-details-content not found");
}

function handleSaveClick() {
  const saveButton = document.getElementById("save");

  if (!saveButton) {
    console.error("Save button not found!");
    return;
  }

  saveButton.addEventListener("click", async () => {
    // for new page add
    document.getElementById("upworkdata").classList.add("hidden");
    document.getElementById("upworkdata").classList.remove("block");

    const aiElement = document.getElementById("AI");
    if (aiElement) {
      aiElement.classList.add("visible"); // Shows the element
      aiElement.classList.remove("hidden"); // Removes hidden class if present
    }

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
              const ele = document.getElementById("alo");
              ele.innerHTML = "";

              const div = document.createElement("div");
              // Assuming each item has 'title' and 'description' properties
              div.innerHTML = `
  <style>
    /* Centering the loader */
    .loader-container {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      width: 100%;
      height: 100%;
      z-index: 1000;
    }
    @keyframes spin {
      0% { transform: rotateY(0deg) translateZ(0); }
      100% { transform: rotateY(360deg) translateZ(0); }
    }
    .meteor {
      width: 150px;
      height: 150px;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.6) 0%, rgba(0, 0, 0, 0.6) 100%);
      border-radius: 50%;
      position: relative;
      animation: spin 3s linear infinite;
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
      transform-style: preserve-3d;
    }
    .meteor::before,
    .meteor::after {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 50%;
      background: inherit;
    }
    .meteor::before { transform: translateZ(-15px); }
    .meteor::after { transform: translateZ(15px); }
    .loading-text {
      font-size: 18px;
      color: white;
      margin-top: 20px;
      font-weight: bold;
      text-align: center;
    }
    .skip-btn {
      margin-top: 30px;
      padding: 10px 40px;
      background: #f87171;
      color: #fff;
      border: none;
      border-radius: 6px;
      font-size: 1em;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }
    .skip-btn:hover {
      background: #dc2626;
    }
  </style>
  <div class="loader-container">
    <div class="meteor"></div>
    <div class="loading-text">Wait for AI response...</div>
    <button class="skip-btn" id="skipLoaderBtn">Skip</button>
  </div>
`;

              ele.appendChild(div);
              // Add skip button event
              setTimeout(() => {
                const skipBtn = document.getElementById('skipLoaderBtn');
                if (skipBtn) {
                  skipBtn.addEventListener('click', () => {
                    chrome.runtime.sendMessage('closeSidePanel');
                  });
                }
              }, 0);

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

                  document
                    .getElementById("handleSave")
                    .addEventListener("click", check);

                  const newData = document.getElementById("handleSave");

                } catch (error) {

                }
              } catch (error) {

              }
              if (data) {
                sucessmsg(
                  isDuplicate
                    ? "Already in CRM — opening the existing record."
                    : "Added to CRM successfully."
                );

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
